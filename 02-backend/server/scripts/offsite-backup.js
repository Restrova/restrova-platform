import {
  backupFailureCode,
  checkOffsiteBackup,
  fetchOffsiteBackup,
  readOffsiteBackupConfig,
  runOffsiteBackup
} from "../src/services/offsiteBackup.js";

const [action, object, destination, expectedChecksum, ...extra] = process.argv.slice(2);
try {
  let result;
  if (action === "run" && !object) {
    result = await runOffsiteBackup(readOffsiteBackupConfig());
  } else if (action === "check" && !object && process.env.RESTROVA_BACKUP_WORK_DIR) {
    result = checkOffsiteBackup(process.env.RESTROVA_BACKUP_WORK_DIR);
  } else if (action === "fetch" && object && destination && expectedChecksum && !extra.length) {
    result = await fetchOffsiteBackup(readOffsiteBackupConfig(), { object, destination, expectedChecksum });
  } else {
    throw new Error("BACKUP_USAGE_INVALID");
  }
  console.log(JSON.stringify({ event: "offsite_backup", action, ...result }));
} catch (error) {
  console.error(JSON.stringify({ event: "offsite_backup", action, status: "failed", code: backupFailureCode(error) }));
  process.exitCode = 1;
}
