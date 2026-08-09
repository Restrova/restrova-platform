# ADR 0001: Keep the monorepo and standardize on pnpm

Date: 2026-08-09

## Status

Accepted

## Context

The repository already has a working monorepo shape with backend, frontend, data/AI, and DevOps/QA sections. The enterprise audit identified mixed npm/pnpm instructions and missing root validation commands.

## Decision

Keep the current monorepo architecture and standardize all developer workflows on pnpm.

## Consequences

- Root scripts provide one consistent entry point for development and validation.
- Documentation should use pnpm commands only.
- CI should run `pnpm validate`.
- The project should not introduce microservices for the current enterprise-foundation phase.
