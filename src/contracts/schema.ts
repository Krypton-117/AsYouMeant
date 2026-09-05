export const contractCandidateSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "documentId",
    "candidateVersion",
    "productVersion",
    "authority",
    "formalStartCommand",
    "requirements",
    "nodes",
    "edges",
    "executionOrder",
    "plannedWork",
    "intentTerms",
    "unresolvedItems"
  ],
  properties: {
    documentId: { $ref: "#/$defs/nonEmptyString" },
    candidateVersion: { $ref: "#/$defs/nonEmptyString" },
    productVersion: {
      type: "string",
      pattern: "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$"
    },
    authority: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "location", "review"],
      properties: {
        kind: { const: "living-document" },
        location: { $ref: "#/$defs/nonEmptyString" },
        review: { const: "PRE_LOOP_REVIEW_PASSED" }
      }
    },
    formalStartCommand: { $ref: "#/$defs/nonEmptyString" },
    requirements: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/requirement" }
    },
    nodes: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/node" }
    },
    edges: {
      type: "array",
      items: { $ref: "#/$defs/edge" }
    },
    executionOrder: { $ref: "#/$defs/nonEmptyStringArray" },
    plannedWork: {
      type: "array",
      items: { $ref: "#/$defs/plannedWork" }
    },
    intentTerms: {
      type: "array",
      items: { $ref: "#/$defs/intentTerm" }
    },
    unresolvedItems: {
      type: "array",
      items: { $ref: "#/$defs/unresolvedItem" }
    }
  },
  $defs: {
    nonEmptyString: { type: "string", minLength: 1 },
    nonEmptyStringArray: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { $ref: "#/$defs/nonEmptyString" }
    },
    stringArray: {
      type: "array",
      uniqueItems: true,
      items: { $ref: "#/$defs/nonEmptyString" }
    },
    permissionDecision: {
      type: "object",
      additionalProperties: false,
      required: ["state", "detail"],
      properties: {
        state: { enum: ["allowed", "not-permitted", "not-applicable"] },
        detail: { $ref: "#/$defs/nonEmptyString" }
      }
    },
    budget: {
      type: "object",
      additionalProperties: false,
      required: ["normalRuns", "diagnosticProbes", "environmentRebuilds", "detail"],
      properties: {
        normalRuns: { type: "integer", minimum: 0 },
        diagnosticProbes: { type: "integer", minimum: 0 },
        environmentRebuilds: { type: "integer", minimum: 0 },
        detail: { $ref: "#/$defs/nonEmptyString" }
      }
    },
    execution: {
      type: "object",
      additionalProperties: false,
      required: [
        "readinessBoundary",
        "sequencing",
        "delegation",
        "isolation",
        "budget",
        "checkpoint",
        "interruptionRecovery",
        "network",
        "credentials",
        "dependencyChanges",
        "externalWrites",
        "irreversibleActions",
        "migration",
        "rollback",
        "retention",
        "cleanup",
        "delivery"
      ],
      properties: {
        readinessBoundary: { $ref: "#/$defs/nonEmptyString" },
        sequencing: { enum: ["serial", "parallel"] },
        delegation: { $ref: "#/$defs/permissionDecision" },
        isolation: { $ref: "#/$defs/permissionDecision" },
        budget: { $ref: "#/$defs/budget" },
        checkpoint: { $ref: "#/$defs/nonEmptyString" },
        interruptionRecovery: { $ref: "#/$defs/nonEmptyString" },
        network: { $ref: "#/$defs/permissionDecision" },
        credentials: { $ref: "#/$defs/permissionDecision" },
        dependencyChanges: { $ref: "#/$defs/permissionDecision" },
        externalWrites: { $ref: "#/$defs/permissionDecision" },
        irreversibleActions: { $ref: "#/$defs/permissionDecision" },
        migration: { $ref: "#/$defs/permissionDecision" },
        rollback: { $ref: "#/$defs/permissionDecision" },
        retention: { $ref: "#/$defs/permissionDecision" },
        cleanup: { $ref: "#/$defs/permissionDecision" },
        delivery: { $ref: "#/$defs/permissionDecision" }
      }
    },
    acceptance: {
      type: "object",
      additionalProperties: false,
      required: [
        "mode",
        "strategy",
        "criteria",
        "oracle",
        "executor",
        "acceptor",
        "evidence",
        "visibility",
        "retry",
        "diagnosticPermission",
        "invalidationRule"
      ],
      properties: {
        mode: { type: "integer", minimum: 1, maximum: 3 },
        strategy: {
          enum: [
            "test-first",
            "implementation-then-check",
            "user-visible",
            "combined",
            "approved-no-test"
          ]
        },
        criteria: { $ref: "#/$defs/nonEmptyStringArray" },
        oracle: { $ref: "#/$defs/nonEmptyString" },
        executor: { $ref: "#/$defs/nonEmptyString" },
        acceptor: { $ref: "#/$defs/nonEmptyString" },
        evidence: { $ref: "#/$defs/nonEmptyStringArray" },
        visibility: { $ref: "#/$defs/nonEmptyString" },
        retry: { $ref: "#/$defs/nonEmptyString" },
        diagnosticPermission: { $ref: "#/$defs/nonEmptyString" },
        invalidationRule: { $ref: "#/$defs/nonEmptyString" }
      }
    },
    node: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "kind",
        "name",
        "behavior",
        "inputs",
        "outputs",
        "interfaces",
        "resources",
        "sideEffects",
        "allowedScope",
        "implementationConstraints",
        "owner",
        "closeRule",
        "requirementIds",
        "acceptance",
        "execution"
      ],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        kind: { enum: ["component", "module", "product"] },
        name: { $ref: "#/$defs/nonEmptyString" },
        behavior: { $ref: "#/$defs/nonEmptyString" },
        inputs: { $ref: "#/$defs/nonEmptyStringArray" },
        outputs: { $ref: "#/$defs/nonEmptyStringArray" },
        interfaces: { $ref: "#/$defs/nonEmptyStringArray" },
        resources: { $ref: "#/$defs/nonEmptyStringArray" },
        sideEffects: { $ref: "#/$defs/nonEmptyStringArray" },
        allowedScope: { $ref: "#/$defs/nonEmptyStringArray" },
        implementationConstraints: { $ref: "#/$defs/nonEmptyStringArray" },
        owner: { $ref: "#/$defs/nonEmptyString" },
        closeRule: { $ref: "#/$defs/nonEmptyString" },
        requirementIds: { $ref: "#/$defs/nonEmptyStringArray" },
        acceptance: { $ref: "#/$defs/acceptance" },
        execution: { $ref: "#/$defs/execution" }
      }
    },
    edge: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "from", "to"],
      properties: {
        kind: { enum: ["ASSEMBLES", "REQUIRES"] },
        from: { $ref: "#/$defs/nonEmptyString" },
        to: { $ref: "#/$defs/nonEmptyString" }
      }
    },
    requirement: {
      type: "object",
      additionalProperties: false,
      required: ["id", "confirmationSource", "intent", "consumerNodeIds", "closeEvidence"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        confirmationSource: { $ref: "#/$defs/nonEmptyString" },
        intent: { $ref: "#/$defs/nonEmptyString" },
        consumerNodeIds: { $ref: "#/$defs/nonEmptyStringArray" },
        closeEvidence: { $ref: "#/$defs/nonEmptyStringArray" }
      }
    },
    plannedWork: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "description", "consumerNodeIds", "allowedScope", "basis"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        kind: { enum: ["action", "test", "review", "dependency", "delivery"] },
        description: { $ref: "#/$defs/nonEmptyString" },
        consumerNodeIds: { $ref: "#/$defs/nonEmptyStringArray" },
        allowedScope: { $ref: "#/$defs/nonEmptyStringArray" },
        basis: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "requirementIds"],
              properties: {
                kind: { const: "requirement" },
                requirementIds: { $ref: "#/$defs/nonEmptyStringArray" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["kind", "workItemId"],
              properties: {
                kind: { const: "necessary-consequence" },
                workItemId: { $ref: "#/$defs/nonEmptyString" }
              }
            }
          ]
        }
      }
    },
    intentTerm: {
      type: "object",
      additionalProperties: false,
      required: ["id", "canonical", "aliases"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        canonical: { $ref: "#/$defs/nonEmptyString" },
        aliases: { $ref: "#/$defs/stringArray" }
      }
    },
    unresolvedItem: {
      type: "object",
      additionalProperties: false,
      required: ["id", "category", "route"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        category: { enum: ["fact", "user-intent", "external-authority", "execution"] },
        route: { $ref: "#/$defs/nonEmptyString" }
      }
    }
  }
} as const;
// SPDX-License-Identifier: MPL-2.0
