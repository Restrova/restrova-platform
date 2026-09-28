import { forbidden } from "../errors/appError.js";
import { getTabularReport, tabularCsv, recordReportExport } from "../services/tabularReportService.js";
import { reportWorkbook } from "../services/reportWorkbook.js";
export function report(req, res) {
  res.set("Cache-Control", "no-store").json(getTabularReport(req.user, req.query));
}
export const exportReport = (format) => (req, res) => {
  if (!["owner", "branch_manager"].includes(req.user.role))
    throw forbidden("Report exports require owner or branch manager access.");
  const report = getTabularReport(req.user, req.query);
  const output = format === "xlsx" ? reportWorkbook(report) : tabularCsv(report);
  recordReportExport(req.user, report, format);
  res
    .set("Cache-Control", "no-store")
    .set("Content-Disposition", `attachment; filename="restrova-${report.kind}-${report.period.fromDate}.${format}"`)
    .type(
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv; charset=utf-8"
    )
    .send(output);
};
