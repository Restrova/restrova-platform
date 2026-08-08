# Data and AI section — مهندس AI وData

Data/AI owners work mainly in:

- [`../../server/src/ai.js`](../../server/src/ai.js)
- [`../../server/src/tools.js`](../../server/src/tools.js)
- [`../../server/evals`](../../server/evals)
- [`../../server/test`](../../server/test)
- [`../../data`](../../data)
- [`../../.tmp-knowledge`](../../.tmp-knowledge)
- Knowledge import and feedback-related backend paths.

## Responsibilities

- Restaurant assistant behavior.
- Tool selection and tool result interpretation.
- Arabic and English response quality.
- Prompt and system behavior rules.
- Knowledge-base retrieval behavior.
- Expert feedback collection flow.
- Evaluation dataset coverage.
- Missing-data and hallucination prevention.

## Must protect

- Never commit copyrighted book text or private restaurant source data.
- Never make up restaurant numbers.
- Always ground financial answers in available data and state missing inputs clearly.
- Keep action-changing behavior behind owner confirmation.
- Treat eval failures as product regressions, not optional warnings.

## Validation before handoff

```bash
npm run eval -w server
npm run test -w server
```
