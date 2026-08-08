# 04 — Data and AI / مهندس AI وData

This section is owned by the Data/AI engineer.

## Main code

- [`evals/`](evals/) — assistant behavior regression dataset and evaluation runner.
- Backend assistant/tool source still lives in [`../02-backend/server/src`](../02-backend/server/src) because it is executed by the API server.
- Private restaurant data and imported knowledge should stay out of GitHub.

## Responsibilities

- Assistant behavior and response quality.
- Arabic and English manager-style answers.
- Evaluation scenarios.
- Knowledge-base retrieval behavior.
- Missing-data handling.
- Hallucination prevention.

## Run AI validation

From the repository root:

```bash
npm run eval -w server
npm run test -w server
```
