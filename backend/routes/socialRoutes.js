  const express = require("express");
  const axios = require("axios");
  const crypto = require("crypto");
  const SocialAccount = require("../models/SocialAccount");
  const { protect, adminOnly } = require("../middleware/authMiddleware");

  const router = express.Router();

  /*
  ====================================================
  META / FACEBOOK CONFIG
  ====================================================
  */

  const META_GRAPH_VERSION =
    process.env.META_GRAPH_VERSION || "v24.0";

  const META_APP_ID =
    process.env.META_APP_ID;

  const META_APP_SECRET =
    process.env.META_APP_SECRET;

  const META_REDIRECT_URI =
    process.env.META_REDIRECT_URI ||
    "http://localhost:5000/api/social-accounts/facebook/callback";

  const META_LOGIN_CONFIG_ID =
    process.env.META_LOGIN_CONFIG_ID;

  const FRONTEND_URL =
    process.env.FRONTEND_URL ||
    "http://localhost:3000";

  const FACEBOOK_PAGE_ID =
    process.env.FACEBOOK_PAGE_ID;

  const GRAPH_BASE =
    `https://graph.facebook.com/${META_GRAPH_VERSION}`;


  /*
  ====================================================
  INSTAGRAM BUSINESS LOGIN CONFIG
  ====================================================
  */

  const INSTAGRAM_APP_ID =
    process.env.INSTAGRAM_APP_ID;

  const INSTAGRAM_APP_SECRET =
    process.env.INSTAGRAM_APP_SECRET;

  const INSTAGRAM_REDIRECT_URI =
    process.env.INSTAGRAM_REDIRECT_URI ||
    "http://localhost:5000/api/social-accounts/instagram/callback";

  const oauthCookieOptions = (path, provider) => {
    const instagramHttpsCallback =
      provider === "instagram" &&
      INSTAGRAM_REDIRECT_URI.startsWith("https://");
    const secure =
      process.env.NODE_ENV === "production" || instagramHttpsCallback;

    return {
      httpOnly: true,
      secure,
      sameSite: secure ? "none" : "lax",
      maxAge: 10 * 60 * 1000,
      path,
    };
  };

  const issueOAuthState = (res, provider) => {
    const state = crypto.randomBytes(32).toString("hex");
    const path = `/api/social-accounts/${provider}/callback`;
    res.cookie(`oauth_${provider}_state`, state, oauthCookieOptions(path, provider));
    return state;
  };

  const consumeOAuthState = (req, res, provider, receivedState) => {
    const name = `oauth_${provider}_state`;
    const entry = (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    const expectedState = entry?.slice(name.length + 1);
    const clearOptions = oauthCookieOptions(`/api/social-accounts/${provider}/callback`, provider);
    delete clearOptions.maxAge;
    res.clearCookie(name, clearOptions);
    if (!expectedState || typeof receivedState !== "string") return false;
    const expected = Buffer.from(expectedState);
    const received = Buffer.from(receivedState);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  };

  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");


  /*
  ====================================================
  GET CONNECTED SOCIAL ACCOUNTS
  ====================================================
  */

  router.get("/", protect, adminOnly, async (req, res) => {
    try {
      const accounts =
        await SocialAccount.find({})
          .select("-accessToken")
          .sort({ createdAt: -1 });

      return res.json({
        success: true,
        accounts,
      });
    } catch (error) {
      console.error(
        "Get social accounts error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to get social accounts",
      });
    }
  });


  /*
  ====================================================
  FACEBOOK CONNECT
  ====================================================

  Facebook OAuth ONLY handles Facebook Page.

  Instagram is handled separately.
  ====================================================
  */

  router.post(
    "/facebook/connect",
    protect,
    adminOnly,
    (req, res) => {
      try {
        if (
          !META_APP_ID ||
          !META_APP_SECRET
        ) {
          return res.status(500).send(`
            <h2>Facebook OAuth Configuration Error</h2>
            <p>
              META_APP_ID or META_APP_SECRET is missing in .env
            </p>
          `);
        }

        const scopes = [
          "pages_show_list",
          "pages_manage_posts",
          "pages_read_engagement",
          "pages_manage_metadata",
          "instagram_basic",
        ].join(",");

        const state = issueOAuthState(res, "facebook");
        const oauthParams = new URLSearchParams({
          client_id: META_APP_ID,
          redirect_uri: META_REDIRECT_URI,
          response_type: "code",
          state,
        });

        if (META_LOGIN_CONFIG_ID) {
          // Permissions are configured in Meta's Login for Business configuration.
          oauthParams.set("config_id", META_LOGIN_CONFIG_ID);
        } else {
          // Standard Facebook Login does not accept instagram_manage_contents.
          oauthParams.set("scope", scopes);
        }

        const facebookOAuthUrl =
          `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${oauthParams.toString()}`;

        console.log("======================================");
        console.log("Opening Facebook OAuth...");
        console.log("Facebook App ID:", META_APP_ID);
        console.log("Facebook OAuth scopes:", scopes);
        console.log("Facebook Login for Business config:", META_LOGIN_CONFIG_ID ? "configured" : "not configured");
        console.log("Facebook redirect:", META_REDIRECT_URI);
        console.log("======================================");

        return res.json({ success: true, url: facebookOAuthUrl });
      } catch (error) {
        console.error(
          "Facebook connect error:",
          error
        );

        return res.status(500).send(`
          <h2>Facebook OAuth Error</h2>
          <p>${error.message}</p>
        `);
      }
    }
  );


  /*
  ====================================================
  FACEBOOK CALLBACK
  ====================================================
  */

  router.get(
    "/facebook/callback",
    async (req, res) => {
      try {
        console.log("======================================");
        console.log("Facebook OAuth callback received.");
        console.log("======================================");

        const {
          code,
          state,
          error,
          error_description,
        } = req.query;

        if (!consumeOAuthState(req, res, "facebook", state)) {
          return res.status(400).send("Facebook authorization state is invalid or expired.");
        }


        /*
        ----------------------------------------
        OAUTH ERROR
        ----------------------------------------
        */

        if (error) {
          console.error(
            "Facebook OAuth error:",
            {
              error,
              error_description,
            }
          );

          return res.status(400).send(`
            <h2>Facebook Authorization Failed</h2>
            <p>
              ${escapeHtml(error_description || error)}
            </p>
          `);
        }


        if (!code) {
          return res.status(400).send(`
            <h2>Facebook Authorization Failed</h2>
            <p>
              Authorization code was not received.
            </p>
          `);
        }


        /*
        ==================================================
        STEP 1
        EXCHANGE CODE FOR USER ACCESS TOKEN
        ==================================================
        */

        console.log(
          "Exchanging Facebook authorization code..."
        );

        const tokenResponse =
          await axios.get(
            `${GRAPH_BASE}/oauth/access_token`,
            {
              params: {
                client_id:
                  META_APP_ID,

                client_secret:
                  META_APP_SECRET,

                redirect_uri:
                  META_REDIRECT_URI,

                code,
              },
            }
          );


        const userAccessToken =
          tokenResponse.data?.access_token;


        console.log(
          "Facebook User Access Token received."
        );


        if (!userAccessToken) {
          return res.status(400).send(`
            <h2>Facebook Authorization Failed</h2>

            <p>
              User access token was not received.
            </p>
          `);
        }


        /*
        ==================================================
        STEP 2
        GET FACEBOOK PAGES
        ==================================================
        */

        let selectedPage = null;

        try {
          console.log(
            "Trying /me/accounts..."
          );

          const pagesResponse =
            await axios.get(
              `${GRAPH_BASE}/me/accounts`,
              {
                params: {
                  fields:
                    "id,name,access_token",

                  access_token:
                    userAccessToken,
                },
              }
            );


          const pages =
            pagesResponse.data?.data || [];


          console.log(
            "Pages returned by /me/accounts:",
            pages.length
          );


          if (pages.length > 0) {
            console.log(
              "Available Facebook Pages:",
              pages.map(
                (page) => ({
                  id: page.id,
                  name: page.name,
                  hasAccessToken:
                    !!page.access_token,
                })
              )
            );
          }


          selectedPage =
            pages.find(
              (page) =>
                String(page.id) ===
                String(FACEBOOK_PAGE_ID)
            );


          if (selectedPage) {
            console.log(
              `Cart2Door found through /me/accounts: ${selectedPage.name}`
            );
          } else {
            console.log(
              "Cart2Door was not returned by /me/accounts."
            );
          }
        } catch (error) {
          console.error(
            "/me/accounts failed:",
            error.response?.data ||
              error.message
          );
        }


        /*
        ==================================================
        STEP 3
        DIRECT PAGE LOOKUP
        ==================================================
        */

        if (!selectedPage) {
          try {
            console.log(
              `Trying direct Page ID: ${FACEBOOK_PAGE_ID}`
            );

            const pageResponse =
              await axios.get(
                `${GRAPH_BASE}/${FACEBOOK_PAGE_ID}`,
                {
                  params: {
                    fields:
                      "id,name,access_token",

                    access_token:
                      userAccessToken,
                  },
                }
              );


            console.log(
              "Direct Page lookup response:",
              {
                id:
                  pageResponse.data?.id,

                name:
                  pageResponse.data?.name,

                hasAccessToken:
                  !!pageResponse.data?.access_token,
              }
            );


            if (
              pageResponse.data?.id
            ) {
              selectedPage =
                pageResponse.data;
            }
          } catch (error) {
            console.error(
              "Direct Page lookup failed:",
              error.response?.data ||
                error.message
            );
          }
        }


        /*
        ==================================================
        STEP 4
        CHECK PAGE
        ==================================================
        */

        if (!selectedPage) {
          return res.status(400).send(`
            <h2>Cart2Door Page could not be accessed</h2>

            <p>
              Facebook authorization was successful,
              but Meta did not return access to the
              Cart2Door Page.
            </p>

            <p>
              Page ID:
              ${FACEBOOK_PAGE_ID}
            </p>

            <p>
              Check the backend terminal for the
              exact Meta API response.
            </p>
          `);
        }


        if (!selectedPage.access_token) {
          console.error(
            "Page found but Page Access Token is missing."
          );

          return res.status(400).send(`
            <h2>Page Access Token Missing</h2>

            <p>
              Cart2Door was found, but Meta did not
              return a Page Access Token.
            </p>
          `);
        }


        console.log(
          "Facebook Page successfully received:",
          {
            id:
              selectedPage.id,

            name:
              selectedPage.name,

            hasAccessToken:
              !!selectedPage.access_token,
          }
        );


        /*
        ==================================================
        STEP 5
        SAVE FACEBOOK ACCOUNT
        ==================================================
        */

        let facebookAccount =
          await SocialAccount.findOne({
            platform: "facebook",

            accountId:
              String(selectedPage.id),
          });


        if (!facebookAccount) {
          facebookAccount =
            new SocialAccount({
              platform: "facebook",

              accountName:
                selectedPage.name,

              accountId:
                String(selectedPage.id),

              accessToken:
                selectedPage.access_token,

              pageId:
                String(selectedPage.id),

              pageName:
                selectedPage.name,

              tokenType:
                "page",

              status:
                "connected",
            });
        } else {
          facebookAccount.accountName =
            selectedPage.name;

          facebookAccount.accountId =
            String(selectedPage.id);

          facebookAccount.accessToken =
            selectedPage.access_token;

          facebookAccount.pageId =
            String(selectedPage.id);

          facebookAccount.pageName =
            selectedPage.name;

          facebookAccount.tokenType =
            "page";

          facebookAccount.status =
            "connected";
        }


        await facebookAccount.save();


        console.log(
          "Facebook account saved successfully."
        );


        return res.redirect(
          `${FRONTEND_URL}/admin-dashboard/social-accounts?facebook=connected`
        );

      } catch (error) {
        console.error(
          "Facebook OAuth callback error:"
        );

        console.error(
          error.response?.data ||
            error.message
        );


        return res.status(500).send(`
          <h2>Facebook Connection Failed</h2>

          <p>
            ${
              error.response?.data?.error?.message ||
              error.message ||
              "Unknown error"
            }
          </p>
        `);
      }
    }
  );


  /*
  ====================================================
  INSTAGRAM BUSINESS LOGIN
  ====================================================

  Instagram is completely separate from Facebook.

  Permissions:
  - instagram_business_basic
  - instagram_business_content_publish
  ====================================================
  */

  router.post(
    "/instagram/connect",
    protect,
    adminOnly,
    (req, res) => {
      try {
        if (
          !INSTAGRAM_APP_ID ||
          !INSTAGRAM_APP_SECRET
        ) {
          return res.status(500).send(`
            <h2>Instagram OAuth Configuration Error</h2>

            <p>
              INSTAGRAM_APP_ID or
              INSTAGRAM_APP_SECRET is missing
              in .env
            </p>
          `);
        }


        const scopes = [
          "instagram_business_basic",
          "instagram_business_content_publish",
          "instagram_business_manage_insights",
        ].join(",");


        const state = issueOAuthState(res, "instagram");
        const instagramOAuthUrl =
          `https://www.instagram.com/oauth/authorize` +
          `?client_id=${encodeURIComponent(INSTAGRAM_APP_ID)}` +
          `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&state=${encodeURIComponent(state)}`;


        console.log("======================================");
        console.log("Opening Instagram Business Login...");
        console.log("Instagram App ID:", INSTAGRAM_APP_ID);
        console.log("Instagram scopes:", scopes);
        console.log(
          "Instagram redirect:",
          INSTAGRAM_REDIRECT_URI
        );
        console.log("======================================");


        return res.json({ success: true, url: instagramOAuthUrl });

      } catch (error) {
        console.error(
          "Instagram connect error:",
          error
        );

        return res.status(500).send(`
          <h2>Instagram OAuth Error</h2>
          <p>${error.message}</p>
        `);
      }
    }
  );


  /*
  ====================================================
  INSTAGRAM BUSINESS LOGIN CALLBACK
  ====================================================
  */

  router.get(
    "/instagram/callback",
    async (req, res) => {
      try {
        console.log("======================================");
        console.log("Instagram OAuth callback received.");
        console.log("======================================");


        const {
          code,
          state,
          error,
          error_reason,
          error_description,
        } = req.query;

        if (!consumeOAuthState(req, res, "instagram", state)) {
          return res.status(400).send("Instagram authorization state is invalid or expired.");
        }


        /*
        ----------------------------------------
        INSTAGRAM OAUTH ERROR
        ----------------------------------------
        */

        if (error) {
          console.error(
            "Instagram OAuth error:",
            {
              error,
              error_reason,
              error_description,
            }
          );

          return res.status(400).send(`
            <h2>Instagram Authorization Failed</h2>

            <p>
              ${escapeHtml(error_description || error_reason || error)}
            </p>
          `);
        }


        if (!code) {
          return res.status(400).send(`
            <h2>Instagram Authorization Failed</h2>

            <p>
              Authorization code was not received.
            </p>

            <p>
              Check backend terminal for:
              INSTAGRAM CALLBACK QUERY
            </p>
          `);
        }


        /*
        ==================================================
        STEP 1
        EXCHANGE CODE FOR INSTAGRAM TOKEN
        ==================================================
        */

        console.log(
          "Exchanging Instagram authorization code..."
        );


        const tokenResponse =
          await axios.post(
            "https://api.instagram.com/oauth/access_token",

            new URLSearchParams({
              client_id:
                INSTAGRAM_APP_ID,

              client_secret:
                INSTAGRAM_APP_SECRET,

              grant_type:
                "authorization_code",

              redirect_uri:
                INSTAGRAM_REDIRECT_URI,

              code:
                code,
            }).toString(),

            {
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded",
              },
            }
          );


        const shortLivedAccessToken =
          tokenResponse.data?.access_token;

        const instagramUserId =
          tokenResponse.data?.user_id;


        console.log(
          "Instagram token response received."
        );

        console.log(
          "Instagram User ID:",
          instagramUserId
        );


        if (!shortLivedAccessToken) {
          return res.status(400).send(`
            <h2>Instagram Authorization Failed</h2>

            <p>
              Instagram access token was not received.
            </p>
          `);
        }


        /*
        ==================================================
        STEP 2
        LONG-LIVED TOKEN
        ==================================================
        */

        let instagramAccessToken =
          shortLivedAccessToken;


        try {
          console.log(
            "Trying long-lived Instagram token exchange..."
          );


          const longLivedResponse =
            await axios.get(
              "https://graph.instagram.com/access_token",
              {
                params: {
                  grant_type:
                    "ig_exchange_token",

                  client_secret:
                    INSTAGRAM_APP_SECRET,

                  access_token:
                    shortLivedAccessToken,
                },
              }
            );


          if (
            longLivedResponse.data?.access_token
          ) {
            instagramAccessToken =
              longLivedResponse.data.access_token;

            console.log(
              "Long-lived Instagram token received."
            );
          }

        } catch (longTokenError) {
          console.error(
            "Long-lived token exchange failed:",
            longTokenError.response?.data ||
              longTokenError.message
          );

          console.log(
            "Continuing with received Instagram token."
          );
        }


        /*
        ==================================================
        STEP 3
        GET INSTAGRAM PROFILE
        ==================================================
        */

        let instagramProfile = null;


        try {
          console.log(
            "Getting Instagram profile..."
          );


          const profileResponse =
    await axios.get(
      "https://graph.instagram.com/me",
      {
        params: {
          fields:
            "id,username,name,profile_picture_url,account_type",

          access_token:
            instagramAccessToken,
        },
      }
    );


          instagramProfile =
            profileResponse.data || {};


          console.log(
            "Instagram profile received:",
            {
              id:
                instagramProfile.id,

              user_id:
                instagramProfile.user_id,

              username:
                instagramProfile.username,

              name:
                instagramProfile.name,

              account_type:
                instagramProfile.account_type,
            }
          );

        } catch (profileError) {
          console.error(
            "Instagram profile lookup failed:",
            profileError.response?.data ||
              profileError.message
          );


          instagramProfile = {
            id:
              instagramUserId || "",

            user_id:
              instagramUserId || "",

            username:
              "",

            name:
              "",

            profile_picture_url:
              "",

            account_type:
              "",
          };
        }


        /*
        ==================================================
        STEP 4
        FINAL INSTAGRAM ACCOUNT ID
        ==================================================
        */

        const finalInstagramId =
    instagramProfile.id ||
    instagramUserId;


        if (!finalInstagramId) {
          return res.status(400).send(`
            <h2>Instagram Account ID Missing</h2>

            <p>
              Instagram login succeeded, but Meta did not
              return an Instagram account ID.
            </p>
          `);
        }


        /*
        ==================================================
        STEP 5
        SAVE INSTAGRAM ACCOUNT
        ==================================================
        */

        let instagramSocialAccount =
          await SocialAccount.findOne({
            platform:
              "instagram",

            accountId:
              String(finalInstagramId),
          });


        if (!instagramSocialAccount) {
          instagramSocialAccount =
            new SocialAccount({
              platform:
                "instagram",

              accountName:
                instagramProfile.username
                  ? `@${instagramProfile.username}`
                  : `Instagram ${finalInstagramId}`,

              accountId:
                String(finalInstagramId),

              accessToken:
                instagramAccessToken,

              instagramAccountId:
                String(finalInstagramId),

              instagramUsername:
                instagramProfile.username || "",

              tokenType:
                "instagram_business_login",

              status:
                "connected",
            });

        } else {
          instagramSocialAccount.accountName =
            instagramProfile.username
              ? `@${instagramProfile.username}`
              : `Instagram ${finalInstagramId}`;

          instagramSocialAccount.accountId =
            String(finalInstagramId);

          instagramSocialAccount.accessToken =
            instagramAccessToken;

          instagramSocialAccount.instagramAccountId =
            String(finalInstagramId);

          instagramSocialAccount.instagramUsername =
            instagramProfile.username || "";

          instagramSocialAccount.tokenType =
            "instagram_business_login";

          instagramSocialAccount.status =
            "connected";
        }


        await instagramSocialAccount.save();


        console.log("======================================");
        console.log(
          "Instagram account saved successfully."
        );
        console.log(
          "Instagram ID:",
          finalInstagramId
        );
        console.log(
          "Instagram Username:",
          instagramProfile.username ||
            "(not returned)"
        );
        console.log("======================================");


        /*
        ==================================================
        STEP 6
        REDIRECT FRONTEND
        ==================================================
        */

        return res.redirect(
          `${FRONTEND_URL}/admin-dashboard/social-accounts?instagram=connected`
        );

      } catch (error) {
        console.error(
          "Instagram OAuth callback error:"
        );

        console.error(
          error.response?.data ||
            error.message
        );


        return res.status(500).send(`
          <h2>Instagram Connection Failed</h2>

          <p>
            ${
              error.response?.data?.error?.message ||
              error.message ||
              "Unknown Instagram OAuth error"
            }
          </p>
        `);
      }
    }
  );


  /*
  ====================================================
  MANUAL FACEBOOK ACCOUNT SAVE / UPDATE
  ====================================================
  */

  router.post(
    "/facebook",
    protect,
    adminOnly,
    async (req, res) => {
      try {
        const {
          accountName,
          accountId,
          accessToken,
          pageId,
          pageName,
        } = req.body;


        if (
          !accountName ||
          !accessToken
        ) {
          return res.status(400).json({
            success: false,

            message:
              "accountName and accessToken are required",
          });
        }


        let account =
          await SocialAccount.findOne({
            platform:
              "facebook",

            accountId:
              accountId || pageId,
          });


        if (!account) {
          account =
            new SocialAccount({
              platform:
                "facebook",

              accountName,

              accountId:
                accountId ||
                pageId ||
                "",

              accessToken,

              pageId:
                pageId || "",

              pageName:
                pageName ||
                accountName,

              tokenType:
                "page",

              status:
                "connected",
            });

        } else {
          account.accountName =
            accountName;

          account.accountId =
            accountId ||
            pageId ||
            account.accountId;

          account.accessToken =
            accessToken;

          account.pageId =
            pageId ||
            account.pageId;

          account.pageName =
            pageName ||
            account.pageName;

          account.tokenType =
            "page";

          account.status =
            "connected";
        }


        await account.save();


        return res.json({
          success: true,

          message:
            "Facebook account connected",

          account: {
            id:
              account._id,

            platform:
              account.platform,

            accountName:
              account.accountName,

            accountId:
              account.accountId,

            pageId:
              account.pageId,

            pageName:
              account.pageName,

            status:
              account.status,
          },
        });

      } catch (error) {
        console.error(
          "Save Facebook account error:",
          error
        );


        return res.status(500).json({
          success: false,

          message:
            error.message ||
            "Failed to save Facebook account",
        });
      }
    }
  );


  /*
  ====================================================
  UPDATE SOCIAL ACCOUNT
  ====================================================
  */

  router.put(
    "/:id",
    protect,
    adminOnly,
    async (req, res) => {
      try {
        const {
          accountName,
          accountId,
          accessToken,
          pageId,
          pageName,
          instagramAccountId,
          instagramUsername,
          status,
        } = req.body;


        const account =
          await SocialAccount.findById(
            req.params.id
          );


        if (!account) {
          return res.status(404).json({
            success: false,

            message:
              "Social account not found",
          });
        }


        if (
          accountName !== undefined
        ) {
          account.accountName =
            accountName;
        }


        if (
          accountId !== undefined
        ) {
          account.accountId =
            accountId;
        }


        if (
          accessToken !== undefined
        ) {
          account.accessToken =
            accessToken;
        }


        if (
          pageId !== undefined
        ) {
          account.pageId =
            pageId;
        }


        if (
          pageName !== undefined
        ) {
          account.pageName =
            pageName;
        }


        if (
          instagramAccountId !== undefined
        ) {
          account.instagramAccountId =
            instagramAccountId;
        }


        if (
          instagramUsername !== undefined
        ) {
          account.instagramUsername =
            instagramUsername;
        }


        if (
          status !== undefined
        ) {
          account.status =
            status;
        }


        await account.save();


        return res.json({
          success: true,

          message:
            "Social account updated",

          account: {
            id:
              account._id,

            platform:
              account.platform,

            accountName:
              account.accountName,

            accountId:
              account.accountId,

            pageId:
              account.pageId,

            pageName:
              account.pageName,

            instagramAccountId:
              account.instagramAccountId,

            instagramUsername:
              account.instagramUsername,

            status:
              account.status,
          },
        });

      } catch (error) {
        console.error(
          "Update social account error:",
          error
        );


        return res.status(500).json({
          success: false,

          message:
            error.message ||
            "Failed to update social account",
        });
      }
    }
  );


  /*
  ====================================================
  DELETE SOCIAL ACCOUNT
  ====================================================
  */

  router.delete(
    "/:id",
    protect,
    adminOnly,
    async (req, res) => {
      try {
        const account =
          await SocialAccount.findByIdAndDelete(
            req.params.id
          );


        if (!account) {
          return res.status(404).json({
            success: false,

            message:
              "Social account not found",
          });
        }


        return res.json({
          success: true,

          message:
            "Social account disconnected",
        });

      } catch (error) {
        console.error(
          "Delete social account error:",
          error
        );


        return res.status(500).json({
          success: false,

          message:
            error.message ||
            "Failed to disconnect social account",
        });
      }
    }
  );


  /*
  ====================================================
  EXPORT
  ====================================================
  */

  module.exports = router;
