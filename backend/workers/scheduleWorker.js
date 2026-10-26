const {
  processDueSchedules,
} = require("../services/publishService");

let workerStarted = false;
let workerInterval = null;

const CHECK_INTERVAL = 30 * 1000;

/* ==========================================
   RUN CHECK
========================================== */

const runScheduleCheck = async () => {
  try {
    await processDueSchedules();
  } catch (error) {
    console.error(
      "Schedule worker check failed:",
      error.message
    );
  }
};

/* ==========================================
   START WORKER
========================================== */

const startScheduleWorker = () => {
  if (workerStarted) {
    console.log(
      "Schedule Worker already running."
    );

    return;
  }

  workerStarted = true;

  console.log(
    "======================================"
  );

  console.log(
    "Schedule Worker Started"
  );

  console.log(
    "Checking schedules every 30 seconds"
  );

  console.log(
    "======================================"
  );

  /*
    Check immediately when server starts.
  */

  runScheduleCheck();

  /*
    Then check every 30 seconds.
  */

  workerInterval = setInterval(
    runScheduleCheck,
    CHECK_INTERVAL
  );
};

/* ==========================================
   STOP WORKER
========================================== */

const stopScheduleWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);

    workerInterval = null;
  }

  workerStarted = false;

  console.log(
    "Schedule Worker stopped."
  );
};

module.exports = {
  startScheduleWorker,
  stopScheduleWorker,
  runScheduleCheck,
};