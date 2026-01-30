# FYND Backend Microservices Architecture - Agent Skills

> A comprehensive agent skill set for debugging, optimizing, and deploying FYND's Kubernetes-based Node.js microservice infrastructure with Kafka, Redis, GCP, and polyglot data layer (MongoDB + PostgreSQL).

**Repository**: `darshil321/fynd-backend-skills`  
**Current Version**: 1.0.0  
**Target Audience**: Backend engineers, DevOps engineers, Platform architects, SRE teams  
**Tech Stack**: Node.js, Kubernetes, GCP, Kafka, Redis, MongoDB, PostgreSQL, LangGraph, LangChain

---

## 📋 Skill Overview

### Problem Statement
FYND's backend architecture spans multiple paradigms (sync HTTP, async Kafka workers, scheduled crons, vector embeddings, multi-LLM routing) across distributed Kubernetes clusters. Common gaps include:

- **Deployment & Orchestration**: Helm chart configuration, GKE rollout strategies, pod lifecycle issues
- **Message Queue Resilience**: Kafka consumer lag monitoring, rebalancing behavior, poison pill handling
- **Caching Strategy**: Redis memory leaks, key expiration patterns, cache invalidation in distributed systems
- **Observability**: Correlation IDs across service boundaries, tracing async Kafka flows, identifying bottlenecks
- **Database Layer**: Sequelize migration failures, pgvector query optimization, MongoDB sharding decisions
- **AI/ML Integration**: LangGraph state management, token counting for cost control, streaming vs. batch inference
- **Cost Optimization**: Resource requests/limits tuning, GCP commitment discounts, Kafka partition strategy

---

## 🎯 Core Skills Matrix

### 1. **Kubernetes & GCP Deployment**
**Skill ID**: `fynd-k8s-gcp-deployment`

#### Use Cases
- Debugging failing pod deployments
- Right-sizing resource requests and limits
- Optimizing GKE cluster scaling
- Managing multi-zone failover
- Implementing graceful shutdown and preemption handling

#### Agent Actions
```
Input: "Pods are in CrashLoopBackOff after deployment"
↓
Agent diagnoses via:
  1. Fetch pod logs (stderr/stdout)
  2. Check liveness/readiness probe configs
  3. Verify resource allocation
  4. Inspect environment variable injection
  5. Review image pull policies
↓
Output: Remediation steps + updated deployment YAML
```

#### Key Tools
- `kubectl logs`, `kubectl describe pod`, `kubectl get events`
- `GCP Artifact Registry` image validation
- Helm templating and diff (Helm hooks, init containers)
- Pod Disruption Budgets (PDB) analysis

#### Example Checklist
- [ ] Health probes configured with proper delays/timeouts
- [ ] Resource requests < node capacity
- [ ] Service account RBAC aligned
- [ ] Image pull secrets registered
- [ ] Preemption/node affinity rules defined
- [ ] Init containers for dependency setup (DB migrations, service discovery)

---

### 2. **Kafka Consumer & Producer Patterns**
**Skill ID**: `fynd-kafka-resilience`

#### Use Cases
- Diagnosing consumer lag spikes
- Recovering from offset corruption
- Handling backpressure and batching
- Implementing exactly-once semantics
- Poison pill and dead-letter queue (DLQ) strategies

#### Agent Actions
```
Input: "AI enrichment Kafka consumer lagging by 50k messages"
↓
Agent investigates:
  1. Fetch consumer group status (lag, offsets, partition assignment)
  2. Check broker metrics (ingestion rate, network throttling)
  3. Analyze consumer logs for slow processing
  4. Review batch size and processing timeout configs
  5. Validate downstream service health
↓
Output: 
  - Scaling recommendation (increase consumer count)
  - Batch size optimization
  - Circuit breaker implementation
  - Rebalancing strategy
```

#### Key Metrics & Commands
```bash
# Consumer lag snapshot
kafka-consumer-groups --bootstrap-server $BROKER --group $GROUP --describe

# Partition assignment
kafka-topics --bootstrap-server $BROKER --topic $TOPIC --describe

# Reset offsets (DLQ recovery)
kafka-consumer-groups --bootstrap-server $BROKER --group $GROUP --reset-offsets --to-earliest --topic $TOPIC --execute
```

#### Patterns
- **Idempotent consumers**: Use message keys + deduplication window
- **Batch processing**: Adjust `max.poll.records` and `session.timeout.ms`
- **DLQ integration**: Forward failures to `topic-name.dlq` with timestamp/attempt counter
- **Monitoring**: Track lag percentage, max lag across partitions, rebalance frequency

---

### 3. **Redis Caching & Pub/Sub**
**Skill ID**: `fynd-redis-optimization`

#### Use Cases
- Identifying memory leaks and eviction policies
- Optimizing key expiration and TTL strategies
- Debugging pub/sub message loss
- Implementing cache stampedes prevention
- Cost reduction via compression and key sizing

#### Agent Actions
```
Input: "Redis memory usage 85% but no apparent code leaks"
↓
Agent analyzes:
  1. Scan for large keys (MEMORY DOCTOR, MEMORY STATS)
  2. Check eviction policy (LRU, LFU, TTL)
  3. Profile command latency (SLOWLOG GET)
  4. Review expiration patterns (KEY patterns with TTL)
  5. Validate pub/sub subscriber counts
↓
Output:
  - Key compression recommendations (serialization: JSON → MessagePack)
  - TTL audit (missing TTL on session/cache keys)
  - Connection pooling optimization
  - Cluster rebalancing strategy
```

#### Key Commands
```bash
# Memory analysis
redis-cli --memkeys           # Top keys by memory
redis-cli MEMORY DOCTOR       # Memory audit report
redis-cli SLOWLOG GET 10      # Top 10 slow commands

# Pub/Sub debugging
redis-cli PUBSUB CHANNELS     # Active channels
redis-cli PUBSUB NUMSUB $CHANNEL  # Subscriber count

# Key expiration
redis-cli SCAN 0 MATCH "*" TYPE string | xargs redis-cli TTL
```

#### Optimization Checklist
- [ ] Maxmemory policy set (typically `allkeys-lru` or `volatile-lru`)
- [ ] TTL on cache entries (avoid indefinite growth)
- [ ] Connection pooling (min/max pool size tuned)
- [ ] Key naming convention to avoid collisions
- [ ] Replication lag monitored (ROLE command)
- [ ] Pipeline usage for batch operations
- [ ] Compression for large values (gzip + base64)

---

### 4. **Observability & Tracing**
**Skill ID**: `fynd-distributed-tracing`

#### Use Cases
- Tracing requests across sync HTTP → Kafka → worker → DB
- Identifying latency hotspots
- Correlating errors to user impact
- Cost analysis per feature/endpoint
- AI/LLM token counting and latency breakdown

#### Agent Actions
```
Input: "API response time degraded, need root cause"
↓
Agent traces:
  1. Inject correlation ID (X-Trace-ID) across services
  2. Fetch traces from Langfuse (LLM calls)
  3. Check PostgreSQL query times (pgBadger logs)
  4. Validate Redis latency (slowlog)
  5. Monitor Kafka end-to-end latency
  6. GCP Cloud Trace for infrastructure metrics
↓
Output:
  - Bottleneck visualization (e.g., DB query 45%, LLM inference 30%, network 15%)
  - Regression detection (compare to baseline)
  - SLO alerting rules
```

#### Telemetry Stack
- **LLM Tracing**: Langfuse integration (token counts, model costs, streaming overhead)
- **Distributed Tracing**: OpenTelemetry spans with baggage (user_id, tenant_id, request_id)
- **Metrics**: Prometheus (latency histograms, error rates, queue depths)
- **Logs**: Structured JSON logs (Morgan middleware) with correlation IDs
- **GCP Integration**: Cloud Logging, Cloud Trace, Cloud Profiler

#### Implementation Checklist
- [ ] X-Request-ID header propagated end-to-end
- [ ] LLM cost tracking per request (input/output tokens × rate)
- [ ] Service-to-service tracing (gRPC metadata or HTTP headers)
- [ ] Async worker tracing (Kafka offset → result tracing)
- [ ] Error context (stack traces, user state, request body redacted)

---

### 5. **Database Migrations & Vector Search**
**Skill ID**: `fynd-database-patterns`

#### Use Cases
- Debugging Sequelize migration failures
- pgvector indexing for similarity search
- MongoDB schema versioning
- Cross-database consistency checks
- Zero-downtime migrations

#### Agent Actions
```
Input: "Migration to add pgvector column failed mid-deployment"
↓
Agent handles:
  1. Check migration status (up/down history)
  2. Verify transaction isolation level
  3. Validate index creation (avoid blocking production)
  4. Rollback strategy (backup, MVCC, replication)
  5. Rerun with retry logic
↓
Output:
  - Corrected migration script
  - Deployment order (PostgreSQL first, then apps consume)
  - Monitoring query for index creation progress
```

#### Key Patterns

**PostgreSQL with pgvector**
```javascript
// Sequelize migration for embeddings
sequelize.define('ProductEmbedding', {
  id: Sequelize.UUID,
  product_id: Sequelize.UUID,
  embedding: Sequelize.VECTOR(1536), // OpenAI dimension
  created_at: Sequelize.DATE,
});

// Create index (HNSW for similarity search)
// ALTER TABLE product_embeddings ADD INDEX idx_embedding USING ivfflat (embedding vector_cosine_ops);
```

**MongoDB Versioning**
```javascript
// Version field for schema evolution
db.products.updateMany(
  { __v: { $exists: false } },
  { $set: { __v: 1, migration_date: new Date() } }
);
```

#### Safety Checklist
- [ ] Migrations tested in staging (same volume as production)
- [ ] Rollback tested (reverse migration runs successfully)
- [ ] Zero-downtime: code backwards-compatible with old schema
- [ ] Concurrent reads allowed during migration (READ COMMITTED isolation)
- [ ] Index created CONCURRENTLY (PostgreSQL)
- [ ] Monitoring for long-running queries during migration

---

### 6. **AI/LLM Integration Patterns**
**Skill ID**: `fynd-langgraph-orchestration`

#### Use Cases
- Debugging LangGraph state transitions
- Optimizing token counts and cost
- Streaming responses without buffering
- Fallback strategies (OpenAI → Vertex AI → DeepSeek)
- Prompt engineering for accuracy

#### Agent Actions
```
Input: "LangGraph supervisor is routing 40% of requests to fallback provider"
↓
Agent investigates:
  1. Check provider health (API latency, error rates, quota limits)
  2. Analyze routing logic (thresholds, retry policies)
  3. Validate fallback quality (token counts, response times)
  4. Cost breakdown per provider
  5. Identify semantic failures (wrong tool selection)
↓
Output:
  - Provider prioritization tuning
  - Fallback trigger optimization
  - Cost savings analysis
  - Prompt refinement suggestions
```

#### Graph Patterns
```javascript
// Supervisor node routing
const supervisor = async (state) => {
  const { messages, current_provider } = state;
  
  // Cost-aware routing: prefer cheaper provider if quality acceptable
  if (tokens.input > 50000) {
    return "vertex_ai"; // More affordable for large context
  }
  
  // Semantic routing: task-specific tool selection
  if (containsCode(messages)) {
    return "openai"; // Better code generation
  }
  
  return current_provider; // Fallback to current
};
```

#### Cost Optimization Checklist
- [ ] Token counting before calling LLM (LiteLLM, Tiktoken)
- [ ] Caching similar queries (prompt caching in Vertex AI)
- [ ] Streaming for large responses (avoid buffering)
- [ ] Batch requests (if latency allows)
- [ ] Model downgrade for simple tasks (GPT-3.5 → GPT-4 routing)

---

### 7. **Performance Debugging & Profiling**
**Skill ID**: `fynd-performance-analysis`

#### Use Cases
- Identifying memory leaks in long-running workers
- CPU profiling for hot paths
- Identifying N+1 queries
- Slow Kafka consumer throughput
- GCP Compute Engine quota exhaustion

#### Agent Actions
```
Input: "Worker memory increases 50MB/hour, crashes after 24h"
↓
Agent profiles:
  1. Enable heap snapshots (NODE_HEAPDUMP)
  2. Capture before/after allocation
  3. Analyze retained objects (detached DOM, listeners, closures)
  4. Check for circular references (MongoDB Mongoose caching)
  5. Validate event listener cleanup
↓
Output:
  - Memory leak location (line number)
  - Fix recommendation (weak references, cleanup in finally)
  - Permanent monitoring setup
```

#### Tools
- **Node.js**: `--inspect`, Chrome DevTools, clinic.js, autocannon (benchmarking)
- **GCP**: Cloud Profiler (CPU + memory), Cloud Trace (latency breakdown)
- **Databases**: EXPLAIN ANALYZE (PostgreSQL), slowlog (MongoDB)
- **Kafka**: Consumer lag graph, partition rebalance timeline

#### Debugging Checklist
- [ ] Baseline metrics captured (healthy state)
- [ ] Load test before/after changes
- [ ] Memory profiler integrated into CI/CD
- [ ] Slow query log enabled (DB + Kafka)
- [ ] Production-like data volume in staging

---

### 8. **Error Handling & Recovery**
**Skill ID**: `fynd-resilience-patterns`

#### Use Cases
- Circuit breaker implementation for external APIs
- Retry logic with exponential backoff
- Handling partial failures in distributed systems
- Dead-letter queue (DLQ) management
- Graceful degradation under overload

#### Agent Actions
```
Input: "External AI service down, breaking all requests"
↓
Agent mitigates:
  1. Activate circuit breaker (fail fast)
  2. Queue requests to DLQ (Kafka backup topic)
  3. Use cached responses if available
  4. Return degraded mode (placeholder response + alert)
  5. Monitor for recovery (half-open state)
↓
Output:
  - Immediate incident response
  - Replay script for DLQ messages
  - Post-incident checklist
```

#### Patterns
```javascript
// Circuit breaker with exponential backoff
const circuitBreaker = {
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  failureCount: 0,
  lastFailureTime: null,
  threshold: 5,
  timeout: 60000,

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  },

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  },

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
};
```

---

## 🛠️ Skill Implementation Framework

### Agent Prompt Template
```
You are FYND backend engineer assistant specialized in:
- Kubernetes deployments on GKE
- Kafka consumer/producer debugging
- Redis caching optimization
- Node.js microservices (Express, LangGraph)
- Observability (Langfuse, OpenTelemetry, Cloud Logging)

When diagnosing issues:
1. Gather metrics (cloud-based or local)
2. Form hypotheses (most likely cause first)
3. Test hypotheses (safe: read-only commands)
4. Provide reproducible steps + remediation
5. Suggest permanent monitoring/alerting

Always prioritize:
- Zero-downtime solutions
- Data consistency guarantees
- Cost implications
- Team knowledge transfer
```

### Example Tool Definitions
```json
{
  "tools": [
    {
      "name": "fetch_pod_logs",
      "description": "Get pod logs with context (tail, previous crashed container)",
      "input_schema": {
        "pod_name": "string",
        "namespace": "string",
        "tail_lines": "integer (default 100)",
        "previous": "boolean (get logs from crashed container)"
      }
    },
    {
      "name": "check_kafka_consumer_lag",
      "description": "Get consumer group lag across partitions",
      "input_schema": {
        "group_id": "string",
        "topic": "string (optional)"
      }
    },
    {
      "name": "analyze_redis_memory",
      "description": "Memory usage breakdown by key pattern",
      "input_schema": {
        "redis_host": "string",
        "scan_pattern": "string (optional, default '*')"
      }
    },
    {
      "name": "query_langfuse_traces",
      "description": "Fetch LLM call traces with latency and token counts",
      "input_schema": {
        "trace_name": "string",
        "limit": "integer (default 10)",
        "timerange": "duration (e.g., '1h', '24h')"
      }
    }
  ]
}
```

---

## 📊 Common Troubleshooting Flowchart

```
┌─────────────────────────────────────────┐
│      User Reports Issue                 │
│  (latency, errors, resource exhaustion) │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴────────┐
      │ Symptom Type?   │
      └────┬──────┬─────┘
           │      │
      ┌────▼─┐  ┌─▼────┐
      │Pod   │  │Kafka │
      │Down  │  │Lag   │
      │Errors│  └──────┘
      └──┬───┘     │
         │    ┌────▼──────┐
         │    │ Check     │
         │    │ Consumer  │
         │    │ Health    │
         │    │ + Lag     │
         │    └──────┬────┘
         │           │
    ┌────▼────┐  ┌───▼────┐
    │ K8s +   │  │Kafka + │
    │ Image   │  │Process │
    │ Issues  │  │Rate    │
    └─────────┘  └────────┘
         │            │
    [kubectl         [Scale
     logs]           consumers]
```

---

## 🚀 Deployment Checklist Template

### Pre-Deployment
- [ ] Code review completed (SLA: <24h)
- [ ] Unit + integration tests pass (coverage >80%)
- [ ] Staging deployment successful (stress test passed)
- [ ] Database migrations tested (rollback verified)
- [ ] Kafka topic changes (partition count, retention)
- [ ] Redis key schema reviewed (no version collisions)

### During Deployment
- [ ] Health checks pass (both live + ready probes)
- [ ] Traffic gradually shifts (5% → 50% → 100% via Istio/Flagger)
- [ ] Error rate <0.1% during rollout
- [ ] No consumer lag spike (Kafka monitoring)
- [ ] Latency p99 <500ms (API endpoints)

### Post-Deployment
- [ ] All pods in Running state
- [ ] Service endpoints responding (health check)
- [ ] Logs clean (no ERROR level spam)
- [ ] Metrics stable (CPU, memory, disk)
- [ ] Rollback plan documented (if needed within 1h)

---

## 📚 Knowledge Base Resources

### GKE + Kubernetes
- GKE Best Practices: https://cloud.google.com/kubernetes-engine/docs/best-practices
- Pod Disruption Budgets: https://kubernetes.io/docs/tasks/run-application/configure-pdb/
- Node Autoscaling: https://cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler

### Kafka
- Kafka Consumer Groups: https://kafka.apache.org/documentation/#consumerconfigs
- Rebalancing Protocol: https://kafka.apache.org/documentation/#consumerconfigs_session.timeout.ms
- Dead Letter Queues: https://kafka.apache.org/documentation/

### PostgreSQL + pgvector
- pgvector Documentation: https://github.com/pgvector/pgvector
- Sequelize Migration: https://sequelize.org/docs/v6/other-topics/migrations/
- Index Performance: https://www.postgresql.org/docs/current/indexes.html

### Node.js Performance
- Node.js Profiling: https://nodejs.org/en/docs/guides/simple-profiling/
- Memory Leaks: https://www.toptal.com/nodejs/debugging-memory-leaks-node-js-applications
- Async Patterns: https://nodejs.org/en/docs/guides/blocking-vs-non-blocking/

### LangGraph & LLMs
- LangGraph Documentation: https://langgraph.js.org/
- Token Counting: https://github.com/openai/tiktoken
- Streaming: https://js.langchain.com/docs/guides/expression_language/streaming

---

## 🎓 Skill Progression

### Level 1: Operational Debugging (Weeks 1-2)
- Pod deployment issues
- Basic Kafka lag investigation
- Redis memory analysis
- Log parsing for errors

### Level 2: Architecture Understanding (Weeks 3-4)
- Request tracing across services
- Migration planning
- Cost optimization opportunities
- Performance bottleneck identification

### Level 3: Advanced Optimization (Weeks 5+)
- Circuit breaker + resilience patterns
- LLM cost modeling and optimization
- Distributed system consistency
- Chaos engineering tests

---

## 🤝 Contributing to FYND Backend Skills

### Adding a New Skill
1. **Define the gap**: What developer problem does this solve?
2. **Create issue** on GitHub with `skill` label
3. **Draft skill doc** (use template above)
4. **Implement tools** (Python/Node.js functions)
5. **Test with examples** (real FYND scenarios)
6. **Submit PR** with documentation + tests

### Feedback & Iteration
- Monthly sync with platform team
- Quarterly skill audit (usage, relevance)
- Annual refresh (tech updates)

---

## 📞 Support & Escalation

- **Immediate**: Pagerduty (incidents > SLA breach)
- **Urgent**: Slack #fynd-platform-on-call
- **Questions**: GitHub Discussions (fynd-backend-skills)
- **Training**: Monthly office hours (Zoom)

---

## Version History

**v1.0.0** (Jan 2026)
- Initial release: 8 core skills
- GKE, Kafka, Redis, Database, Observability, LLM, Performance, Resilience
- 50+ example scenarios
- Community feedback channel open

---

## License

Licensed under MIT. Part of the FYND platform engineering ecosystem.
