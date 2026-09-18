import * as service from "../services/integrationService.js";
const send = (res, data, status = 200) => res.status(status).set("Cache-Control", "no-store").json(data);
export const list = (req, res) => send(res, service.listConnectors(req.user));
export const create = (req, res) => send(res, service.createConnector(req.user, req.body), 201);
export const preview = (req, res) =>
  send(
    res,
    service.previewConnector(req.user, req.params.id, {
      filename: req.query.filename,
      buffer: req.body,
      requestId: req.requestId
    }),
    201
  );
export const mapping = (req, res) =>
  send(res, service.mapConnector(req.user, req.params.id, req.params.jobId, req.body, req.requestId));
export const confirm = (req, res) =>
  send(res, service.confirmConnector(req.user, req.params.id, req.params.jobId, req.body, req.requestId));
export const history = (req, res) => send(res, service.connectorHistory(req.user, req.params.id));
