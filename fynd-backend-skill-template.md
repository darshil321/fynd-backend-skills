# FYND Backend Microservices Agent Skill

```yaml
# Metadata for skills.sh platform
skill:
  id: fynd-backend-microservices-suite
  name: FYND Backend Microservices Architecture
  namespace: darshil321/fynd-backend-skills
  version: 1.0.0
  
  # Core skill descriptors
  description: |
    Expert-level debugging and optimization for FYND's Kubernetes-based Node.js microservices
    architecture. Covers GCP GKE deployments, Kafka event streaming, Redis caching, polyglot
    data layers (MongoDB + PostgreSQL with pgvector), observability, and LLM integrations.
  
  keywords:
    - kubernetes
    - gcp
    - kafka
    - redis
    - nodejs
    - microservices
    - monitoring
    - distributed-systems
    - database-architecture
    - llm-integration
  
  tags:
    - backend-engineering
    - devops
    - platform-architecture
    - cost-optimization
    - observability
  
  categories:
    - Backend
    - DevOps
    - Cloud Architecture
    - Distributed Systems
  
  author:
    name: DevX AI Labs (FYND Platform Team)
    email: platform@devx-ai.com
  
  # Audience
  target_roles:
    - Backend Engineer
    - DevOps Engineer
    - SRE
    - Platform Architect
    - Technical Lead
  
  estimated_learning_time_hours: 16
  
  # Prerequisite knowledge
  prerequisites:
    - Kubernetes basics (pods, deployments, services)
    - Node.js async patterns (promises, events)
    - SQL + NoSQL fundamentals
    - Distributed systems concepts
    - HTTP + message queue patterns
```

---

## 📚 Skill Structure

### Tier 1: Quick Reference (For Rapid Debugging)

#### Problem: Pods Keep Crashing
```
🔍 Diagnose:
  kubectl logs -f POD_NAME --tail=50
  kubectl describe pod POD_NAME
  kubectl get events --sort-by='.lastTimestamp'

✅ Common Fixes:
  1. OOMKilled → Increase memory limit in deployment
  2. ImagePullBackOff → Check registry credentials
  3. CrashLoopBackOff → Check entrypoint/health probes
  4. Pending → Insufficient cluster resources
```

#### Problem: Kafka Consumer Lagging
```
🔍 Check:
  kafka-consumer-groups --bootstrap-server $BROKER \
    --group $GROUP --describe
  
  # Find partition with max lag
  kafka-topics --bootstrap-server $BROKER \
    --topic $TOPIC --describe

✅ Actions:
  1. Scale consumers: kubectl scale deployment consumer-name --replicas=3
  2. Check downstream service: curl service-health-endpoint
  3. Monitor broker CPU/disk space
  4. Consider partition redistribution
```

#### Problem: Redis Memory Usage Spike
```
🔍 Analyze:
  redis-cli --memkeys
  redis-cli MEMORY DOCTOR
  redis-cli SLOWLOG GET 10

✅ Actions:
  1. Identify large keys: SCAN + STRLEN
  2. Set TTLs: EXPIRE key 3600
  3. Check eviction policy: CONFIG GET maxmemory-policy
  4. Consider compression for values
```

---

### Tier 2: Implementation Patterns

#### Pattern 1: Health Check Orchestration
```javascript
// Health endpoint implementation
app.get('/_healthz', async (req, res) => {
  const checks = {
    kafka: await checkKafkaHealth(),
    redis: await checkRedisHealth(),
    postgres: await checkPostgresHealth(),
    mongodb: await checkMongoHealth(),
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok');
  res.status(allHealthy ? 200 : 503).json(checks);
});

// Kubernetes liveness probe: exits container on repeated failures
// Readiness probe: removes from load balancer on failure
```

#### Pattern 2: Graceful Shutdown
```javascript
const server = app.listen(3000);
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, graceful shutdown started');
  isShuttingDown = true;

  // Stop accepting new requests
  server.close();

  // Wait for existing connections to close (30s timeout)
  const shutdownTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);

  // Drain Kafka consumers
  await kafkaConsumer.disconnect();

  // Flush Redis pub/sub
  await redis.quit();

  // Wait for DB connections
  await sequelize.close();

  clearTimeout(shutdownTimeout);
  process.exit(0);
});

// Reject requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.status(503).json({ error: 'Service shutting down' });
  } else {
    next();
  }
});
```

#### Pattern 3: Distributed Tracing Setup
```javascript
// Global request ID middleware
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  const traceId = req.headers['x-trace-id'] || uuidv4();
  req.traceId = traceId;
  res.setHeader('X-Trace-ID', traceId);

  // Propagate to downstream services
  req.http = {
    headers: {
      'X-Trace-ID': traceId,
      'X-Request-ID': uuidv4(),
      'X-Forwarded-For': req.ip,
    }
  };

  next();
});

// Langfuse tracing for LLM calls
import { Langfuse } from 'langfuse';

const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL,
});

// Trace LLM invocation
const trace = langfuse.trace({
  name: 'product-enrichment',
  userId: req.user?.id,
  metadata: { product_id: productId },
  tags: ['enrichment', 'ai'],
});

const response = await llm.call(input, {
  callbacks: [
    langfuse.getTraceHandler({ trace }),
  ]
});

trace.end();
```

#### Pattern 4: Kafka Consumer Error Handling
```javascript
const consumer = kafka.consumer({ groupId: 'product-enrichment' });

await consumer.subscribe({ topic: 'products-raw', fromBeginning: false });

const eachMessage = async ({ topic, partition, message }) => {
  const startTime = Date.now();
  const messageId = `${partition}:${message.offset}`;
  let retries = 0;
  const maxRetries = 3;

  while (retries < maxRetries) {
    try {
      const payload = JSON.parse(message.value.toString());
      await processProduct(payload, { traceId: req.traceId });
      
      logger.info('Message processed', { messageId, duration: Date.now() - startTime });
      return; // Success
    } catch (error) {
      retries++;
      
      if (retries >= maxRetries) {
        // Send to DLQ
        await producer.send({
          topic: 'products-raw.dlq',
          messages: [{
            key: message.key,
            value: JSON.stringify({
              original_message: JSON.parse(message.value.toString()),
              error: error.message,
              stack: error.stack,
              timestamp: new Date(),
              attempts: retries,
            }),
            headers: {
              'x-dlq-reason': 'max-retries-exceeded',
              'x-original-offset': message.offset.toString(),
            }
          }],
        });

        logger.error('Message sent to DLQ', { messageId, error: error.message });
        return;
      }

      // Exponential backoff before retry
      const backoffMs = Math.min(1000 * Math.pow(2, retries), 30000);
      logger.warn('Retrying message', { messageId, attempt: retries, backoffMs });
      await sleep(backoffMs);
    }
  }
};

await consumer.run({ eachMessage });
```

#### Pattern 5: Database Migration with Zero Downtime
```javascript
// migration-add-pgvector.js
module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Add column as nullable
    await queryInterface.addColumn('product_embeddings', 'embedding_new', {
      type: Sequelize.VECTOR(1536),
      allowNull: true,
    });

    // Step 2: Backfill data (in batches to avoid locking)
    const batchSize = 1000;
    const total = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM product_embeddings'
    );
    const count = total[0][0].count;

    for (let offset = 0; offset < count; offset += batchSize) {
      await queryInterface.sequelize.query(`
        UPDATE product_embeddings
        SET embedding_new = embedding
        WHERE id IN (
          SELECT id FROM product_embeddings
          WHERE embedding_new IS NULL
          LIMIT ${batchSize}
        )
      `);
      console.log(`Migrated ${Math.min(offset + batchSize, count)}/${count}`);
    }

    // Step 3: Drop old column and rename (still backward-compatible in code)
    await queryInterface.removeColumn('product_embeddings', 'embedding');
    await queryInterface.renameColumn('product_embeddings', 'embedding_new', 'embedding');

    // Step 4: Add constraints
    await queryInterface.changeColumn('product_embeddings', 'embedding', {
      type: Sequelize.VECTOR(1536),
      allowNull: false,
    });

    // Step 5: Create index (CONCURRENT to not lock table)
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY idx_embedding_hnsw ON product_embeddings USING ivfflat (embedding vector_cosine_ops)'
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('product_embeddings', 'embedding');
  }
};
```

---

### Tier 3: Deep Dives & Architecture

#### Deep Dive 1: Kafka Consumer Rebalancing
```
📊 How Rebalancing Works:

  1. Trigger Events:
     - New consumer joins group
     - Consumer crashes/timeout (session.timeout.ms)
     - Topics subscribed changes
     - Partitions added/removed

  2. Rebalance Phases:
     Revoke → [generation increase] → Assign → Resume
     
  3. During Rebalance:
     ⚠️  No messages consumed
     ⚠️  Lag increases dramatically
     ⚠️  Offsets must be committed

  4. Optimization:
     - max.poll.interval.ms: Increase if processing is slow
     - session.timeout.ms: Balance between crash detection (lower) and GC pauses
     - heartbeat.interval.ms: 1/3 of session timeout typically
     - Avoid long locks/sleeps in process loop
```

#### Deep Dive 2: pgvector Similarity Search
```sql
-- Single product similarity search
SELECT product_id, 
       1 - (embedding <-> query_vector) as similarity
FROM product_embeddings
ORDER BY embedding <-> query_vector
LIMIT 10;

-- Indexing strategy
-- IVFFlat: Fast approximate nearest neighbor (Inverted File Index)
-- HNSW: Slower indexing but faster search (Hierarchical Navigable Small Worlds)

CREATE INDEX CONCURRENTLY idx_embedding_ivfflat 
ON product_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Tuning IVFFlat
SET ivfflat.probes = 10;  -- Increase accuracy (more candidates examined)

-- For bulk similarity search
SELECT p1.product_id, p2.product_id,
       1 - (p1.embedding <-> p2.embedding) as similarity
FROM product_embeddings p1
CROSS JOIN product_embeddings p2
WHERE p1.product_id < p2.product_id
ORDER BY similarity DESC
LIMIT 100;
```

#### Deep Dive 3: Redis Key Expiration Strategies
```javascript
// Strategy 1: Time-based expiration (Cache)
redis.setex(`cache:product:${id}`, 3600, productData); // 1 hour TTL

// Strategy 2: Lazy expiration (Sessions)
redis.set(`session:${sessionId}`, sessionData, 'EX', 86400); // 24 hours
// Extend on activity
redis.expire(`session:${sessionId}`, 86400); // Reset timer

// Strategy 3: Batch cleanup (Scheduled)
// Instead of per-key, cleanup expired keys periodically
cron.schedule('0 2 * * *', async () => {
  // Run SCAN and delete expired patterns
  const keys = await redis.keys('session:*');
  const expired = keys.filter(k => !redis.exists(k));
  // Cleanup
});

// Strategy 4: Memory optimization
// Use compression for large values
const serialized = JSON.stringify(largeObj);
const compressed = zlib.gzipSync(serialized);
redis.set(`compressed:key`, compressed);

// Retrieve
const compressed = redis.getBuffer(`compressed:key`);
const decompressed = zlib.gunzipSync(compressed);
const obj = JSON.parse(decompressed.toString());
```

#### Deep Dive 4: Cost Analysis Framework
```javascript
// LLM Cost Tracking
const trackLLMCost = async (modelName, tokenCounts) => {
  const rates = {
    'gpt-4o': { input: 0.005, output: 0.015 }, // per 1K tokens
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'gemini-1.5': { input: 0.00075, output: 0.003 },
  };

  const { input_tokens, output_tokens } = tokenCounts;
  const rate = rates[modelName];
  
  const cost = (
    (input_tokens / 1000) * rate.input +
    (output_tokens / 1000) * rate.output
  );

  // Track in Langfuse for dashboard
  await langfuse.trace({
    name: 'llm-cost',
    metadata: {
      model: modelName,
      input_tokens,
      output_tokens,
      cost_usd: cost.toFixed(6),
      route: req.path,
    }
  });

  return cost;
};

// Kubernetes Cost Estimation
const k8sResourceCost = {
  // GKE on-demand pricing (example: us-central1)
  cpu_per_month: 30, // $ per vCPU
  memory_per_gb_month: 4, // $ per GB RAM
  persistent_disk_per_gb_month: 0.10, // $ per GB

  calculatePodCost(cpuCore, memoryGb, hours_per_month = 730) {
    return (
      cpuCore * (this.cpu_per_month / 730) * hours_per_month +
      memoryGb * (this.memory_per_gb_month / 730) * hours_per_month
    );
  }
};

// Example: Cost of running 3 replicas
const deployment = {
  name: 'product-enrichment',
  replicas: 3,
  resources: {
    requests: { cpu: 0.5, memory: '512Mi' },
    limits: { cpu: 1, memory: '1Gi' }
  }
};

const monthlyCost = 
  deployment.replicas * 
  k8sResourceCost.calculatePodCost(
    deployment.resources.requests.cpu,
    0.5 // 512Mi = 0.5GB
  );

console.log(`Monthly cost: $${monthlyCost.toFixed(2)}`);
```

---

## 🔧 Common Scenarios & Solutions

### Scenario 1: API Latency Spike (P99 > 1s)
```
Timeline:
  T-0: Latency normal (p99=150ms)
  T+5min: Spike to p99=2000ms
  T+10min: Alerts firing

Investigation Checklist:
  ✓ Check GKE node CPU/memory
  ✓ Review database query times (EXPLAIN ANALYZE)
  ✓ Check Redis latency (SLOWLOG)
  ✓ Verify Kafka consumer lag
  ✓ Review LLM API response times (Langfuse)
  ✓ Check for recent deployments (Argo CD rollout status)
  ✓ Network latency (GCP VPC flow logs)

Typical Root Causes & Fixes:
  1. New pod deployment causing uneven distribution
     → Check pod antiaffinity rules
  2. Database query regression
     → Compare query plans (slow logs)
  3. Kafka consumer lag → processing time increased
     → Profile consumer function
  4. LLM API degradation (external)
     → Circuit breaker + fallback model
  5. Node preemption (Spot instances)
     → Check GKE preemption settings
```

### Scenario 2: OOMKilled Pod Restart Cycle
```
Diagnosis:
  1. kubectl get pod POD_NAME -o json | jq '.status.containerStatuses'
  2. Look for: "reason": "OOMKilled"
  3. Check: memory limit vs. actual usage spike

Root Causes:
  - Memory leak in application (detached objects, event listeners)
  - Caching strategy not considering pod memory
  - Bulk import without batching
  - Node memory pressure (too many pods)

Solutions:
  # Immediate: Increase limit (temporary)
  kubectl set resources deployment APP_NAME --limits=memory=2Gi
  
  # Proper fix: Identify leak
  node --inspect app.js
  # Use Chrome DevTools to profile memory
  
  # Caching fix: Implement size-based eviction
  import LRU from 'lru-cache';
  const cache = new LRU({
    max: 500,  // items
    maxSize: 100 * 1024 * 1024,  // 100MB
    sizeCalculation: (obj) => JSON.stringify(obj).length,
  });
```

### Scenario 3: Kafka Consumer Group Stuck at offset
```
Problem: Consumer reads same message 1000s of times

Investigation:
  kafka-consumer-groups --bootstrap-server $BROKER --group $GROUP --describe
  # Note: current-offset way ahead of log-end-offset (lag is huge)

Causes:
  1. Consumer crashes before committing offset
     → Check logs: "Offset commit failed"
  2. Long processing time causes timeout
     → max.poll.interval.ms too short
  3. Poison pill message (crashes every time)
     → Skip to next offset

Solutions:
  # Find poison message
  kafka-consumer-groups --bootstrap-server $BROKER --group $GROUP \
    --reset-offsets --to-offset 12345 --topic topic-name --execute
  
  # Restart consumer manually with new offset
  
  # Implement circuit breaker in consumer
  const handleMessage = async (message, retries = 0) => {
    try {
      await processMessage(message);
    } catch (error) {
      if (retries < 3 && !isPoisonPill(error)) {
        await sleep(1000 * Math.pow(2, retries));
        return handleMessage(message, retries + 1);
      }
      // After 3 retries or poison pill, skip
      logger.error('Skipping poison pill', { offset: message.offset });
    }
  };
```

---

## 📋 Decision Trees

### When to Scale Consumers
```
Is Kafka lag growing?
├─ YES → Is consumer CPU > 80%?
│   ├─ YES → Scale horizontally (add replicas)
│   │   └─ Monitor: max(lag)/consumer_count should decrease
│   └─ NO → Optimize processing (reduce per-message time)
│       └─ Profile consumer function, add caching, batch operations
└─ NO → Check broker metrics
    ├─ Broker CPU high? → Add partitions (might not help if limited to CPU)
    └─ Broker disk full? → Cleanup old topics, reduce retention
```

### When to use Redis vs In-Memory Cache
```
Cache Size < 100MB?
├─ YES → In-memory (LRU-cache npm)
│   └─ Single process, no network latency
└─ NO → Use Redis
    ├─ Multi-process/multi-pod sharing needed? → YES
    └─ High-throughput caching?
        └─ Check: qps > 10k? → Increase Redis connections
```

### When to Migrate MongoDB to PostgreSQL
```
Data Relationships Complex?
├─ YES (Many-to-many, aggregations) → PostgreSQL
└─ NO → Can stay in MongoDB

Document Size Large?
├─ YES (> 16MB limit) → PostgreSQL (bytea) or S3
└─ NO → Can use MongoDB

Query Patterns Complex?
├─ YES (Multiple JOINs, GROUP BY) → PostgreSQL
└─ NO → MongoDB OK

Consistency Critical?
├─ YES (Financial, inventory) → PostgreSQL + ACID
└─ NO → MongoDB eventual consistency OK
```

---

## 🎓 Learning Resources by Role

### For Backend Engineers
1. Start: Tier 1 Quick Reference (health checks, debugging)
2. Then: Patterns (graceful shutdown, tracing, error handling)
3. Deep: Kafka rebalancing, Database migrations
4. Practice: Implement health checks in your service

### For DevOps/SRE
1. Start: Kubernetes debugging, Pod lifecycle
2. Patterns: Graceful shutdown, health checks
3. Deep: Cost analysis, Kafka rebalancing
4. Practice: Deploy sample microservice, trigger failures, recover

### For Architects
1. Overview: All tiers (understand full stack)
2. Focus: Decision trees, cost analysis
3. Deep: Distributed system tradeoffs
4. Practice: Design new service, evaluate tech choices

---

## 🚨 Incident Response Templates

### Template: Service Unavailable
```
Severity: P1 | Incident ID: INC-2024-001 | Started: 14:30 UTC

Initial Assessment (First 5 Minutes):
  □ Confirm: Is service actually down? (health endpoint)
  □ Scope: Single pod? Entire service? Multiple services?
  □ Timeline: When did it start? Any recent changes?

Investigation (5-15 Minutes):
  □ Check pod status: kubectl get pods -l app=SERVICE
  □ Check recent deployments: kubectl rollout history deployment/SERVICE
  □ Check logs: kubectl logs -f POD_NAME
  □ Database connectivity: SELECT 1 FROM pg_database WHERE datname='db'
  □ Kafka health: kafka-broker-api-versions --bootstrap-server $BROKER

Immediate Action (0-15 Minutes):
  □ If recent deployment: kubectl rollout undo deployment/SERVICE
  □ If pod crashing: Scale to 0, then back to N (forces restart)
  □ If database issue: Failover to replica (if available)
  □ If external API down: Activate circuit breaker

Communication (Parallel):
  □ Post to #incidents Slack channel
  □ Update status page
  □ Notify on-call manager
  □ Page platform team if needed

Resolution & Post-Incident:
  □ Once resolved: Document root cause
  □ Add monitoring to prevent recurrence
  □ Schedule post-incident review (within 24h)
  □ Update runbook with new learnings
```

---

## 📞 Escalation Matrix

| Issue | Check | If Still Failed | Escalate To |
|-------|-------|-----------------|------------|
| Pod CrashLoopBackOff | App logs | After 2 rollbacks | Backend Lead + SRE |
| Kafka lag > 100k | Consumer CPU | Persists > 30min | Message Queue Team |
| Database query slow | Query plan | EXPLAIN suggests index | DBA + Backend |
| GKE node pressure | kubectl top | Multiple nodes affected | Cloud Team |
| LLM API timeout | Provider status | Fallback not working | Platform Architect |

---

## 🏆 Success Metrics

- **MTTR** (Mean Time To Resolution): < 15min for P1s
- **Error Budget**: Keep error rate < 0.1%
- **Latency SLO**: p99 < 500ms for APIs
- **Cost Per Request**: Track and trend downward quarterly
- **On-Call Happiness**: Fewer than 2 pages per week for backend

---

## Contributing & Feedback

Have a scenario not covered? Create a GitHub issue on:
`github.com/darshil321/fynd-backend-skills/issues`

Want to improve a section? Submit a pull request with:
- Problem scenario
- Root cause analysis
- Step-by-step solution
- Monitoring/alerting recommendations

Quarterly sync to align with actual FYND platform changes.
