# FYND Backend Skills - Agent Integration Guide

## 🤖 Implementing Skills as Agent Tools

### 1. Define Tools in LangGraph

```python
# fynd_backend_tools.py
from typing import Any, Callable
from langgraph.graph import END, Graph, START
from langchain_core.tools import tool
import subprocess
import json
import logging

logger = logging.getLogger(__name__)

class FYNDBackendTools:
    """Tool collection for FYND backend debugging and optimization"""
    
    @staticmethod
    @tool
    def check_pod_status(namespace: str = "default", pod_pattern: str = None) -> dict:
        """
        Get status of pods in Kubernetes cluster.
        
        Args:
            namespace: Kubernetes namespace (default: 'default')
            pod_pattern: Optional pattern to filter pods (e.g., 'product-enrichment')
        
        Returns:
            dict with pod statuses and diagnostics
        """
        try:
            cmd = f"kubectl get pods -n {namespace}"
            if pod_pattern:
                cmd += f" -l app={pod_pattern}"
            cmd += " -o json"
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            pods = json.loads(result.stdout)
            
            status = {
                "namespace": namespace,
                "total_pods": len(pods.get("items", [])),
                "pods": []
            }
            
            for pod in pods.get("items", []):
                pod_status = {
                    "name": pod["metadata"]["name"],
                    "phase": pod["status"]["phase"],
                    "restart_count": 0,
                    "conditions": [],
                    "container_states": []
                }
                
                # Extract container information
                if "containerStatuses" in pod["status"]:
                    for container in pod["status"]["containerStatuses"]:
                        pod_status["restart_count"] = container.get("restartCount", 0)
                        
                        if "state" in container:
                            state = container["state"]
                            if "waiting" in state:
                                pod_status["container_states"].append({
                                    "state": "waiting",
                                    "reason": state["waiting"].get("reason"),
                                    "message": state["waiting"].get("message")
                                })
                            elif "terminated" in state:
                                pod_status["container_states"].append({
                                    "state": "terminated",
                                    "exit_code": state["terminated"].get("exitCode"),
                                    "reason": state["terminated"].get("reason")
                                })
                
                # Extract conditions
                for condition in pod["status"].get("conditions", []):
                    pod_status["conditions"].append({
                        "type": condition["type"],
                        "status": condition["status"],
                        "reason": condition.get("reason"),
                        "message": condition.get("message")
                    })
                
                status["pods"].append(pod_status)
            
            return status
        
        except Exception as e:
            return {"error": str(e), "message": "Failed to check pod status"}

    @staticmethod
    @tool
    def get_pod_logs(pod_name: str, namespace: str = "default", tail_lines: int = 100, 
                     previous: bool = False) -> str:
        """
        Get logs from a specific pod.
        
        Args:
            pod_name: Name of the pod
            namespace: Kubernetes namespace
            tail_lines: Number of lines to retrieve
            previous: Get logs from previous (crashed) container
        
        Returns:
            Pod logs as string
        """
        try:
            cmd = f"kubectl logs {pod_name} -n {namespace} --tail={tail_lines}"
            if previous:
                cmd += " --previous"
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            return result.stdout or result.stderr
        
        except Exception as e:
            return f"Error retrieving logs: {str(e)}"

    @staticmethod
    @tool
    def check_kafka_consumer_lag(group_id: str, broker: str = "localhost:9092", 
                                 topic: str = None) -> dict:
        """
        Check Kafka consumer group lag.
        
        Args:
            group_id: Consumer group name
            broker: Kafka broker address
            topic: Optional specific topic
        
        Returns:
            dict with lag information
        """
        try:
            cmd = f"kafka-consumer-groups --bootstrap-server {broker} " \
                  f"--group {group_id} --describe"
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            lag_data = {
                "group_id": group_id,
                "total_lag": 0,
                "partitions": []
            }
            
            lines = result.stdout.strip().split('\n')[1:]  # Skip header
            for line in lines:
                parts = line.split()
                if len(parts) >= 6:
                    partition_lag = {
                        "topic": parts[0],
                        "partition": parts[1],
                        "current_offset": int(parts[2]),
                        "log_end_offset": int(parts[3]),
                        "lag": int(parts[4]),
                        "consumer_id": parts[5] if len(parts) > 5 else "unknown"
                    }
                    lag_data["partitions"].append(partition_lag)
                    lag_data["total_lag"] += partition_lag["lag"]
            
            lag_data["status"] = "healthy" if lag_data["total_lag"] < 1000 else "warning" \
                                 if lag_data["total_lag"] < 10000 else "critical"
            
            return lag_data
        
        except Exception as e:
            return {"error": str(e), "message": "Failed to check consumer lag"}

    @staticmethod
    @tool
    def analyze_redis_memory(redis_host: str = "localhost", redis_port: int = 6379,
                            scan_pattern: str = "*") -> dict:
        """
        Analyze Redis memory usage.
        
        Args:
            redis_host: Redis host
            redis_port: Redis port
            scan_pattern: Pattern for key scanning
        
        Returns:
            dict with memory analysis
        """
        try:
            import redis
            
            client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
            
            # Get memory info
            info = client.info('memory')
            
            analysis = {
                "host": redis_host,
                "port": redis_port,
                "used_memory_mb": info['used_memory'] / (1024 * 1024),
                "max_memory_mb": info.get('maxmemory', 0) / (1024 * 1024),
                "used_percentage": round((info['used_memory'] / info.get('maxmemory', 1)) * 100, 2),
                "eviction_policy": client.config_get('maxmemory-policy')['maxmemory-policy'],
                "top_keys": []
            }
            
            # Scan for large keys
            cursor = 0
            keys_checked = 0
            max_size_keys = []
            
            while keys_checked < 1000:  # Limit scan to prevent blocking
                cursor, keys = client.scan(cursor, match=scan_pattern, count=100)
                
                for key in keys:
                    try:
                        size = client.memory_usage(key) or 0
                        max_size_keys.append({
                            "key": key,
                            "size_bytes": size,
                            "size_mb": size / (1024 * 1024),
                            "type": client.type(key)
                        })
                    except:
                        pass
                    
                    keys_checked += 1
                    if keys_checked >= 1000:
                        break
                
                if cursor == 0:
                    break
            
            # Top 10 largest keys
            analysis["top_keys"] = sorted(max_size_keys, 
                                         key=lambda x: x["size_bytes"], 
                                         reverse=True)[:10]
            
            return analysis
        
        except Exception as e:
            return {"error": str(e), "message": "Failed to analyze Redis memory"}

    @staticmethod
    @tool
    def query_database_slow_log(db_type: str = "postgres", host: str = "localhost",
                                port: int = 5432, limit: int = 10) -> list:
        """
        Get slow query logs from database.
        
        Args:
            db_type: 'postgres' or 'mongodb'
            host: Database host
            port: Database port
            limit: Number of queries to retrieve
        
        Returns:
            List of slow queries with timing
        """
        try:
            if db_type == "postgres":
                # Requires log_statement='all' or pg_stat_statements extension
                import psycopg2
                
                conn = psycopg2.connect(
                    host=host,
                    port=port,
                    database="postgres",
                    user="postgres"
                )
                cursor = conn.cursor()
                
                # Using pg_stat_statements extension
                query = f"""
                SELECT query, calls, total_time, mean_time, max_time
                FROM pg_stat_statements
                ORDER BY max_time DESC
                LIMIT {limit}
                """
                
                cursor.execute(query)
                columns = [desc[0] for desc in cursor.description]
                results = []
                
                for row in cursor.fetchall():
                    results.append(dict(zip(columns, row)))
                
                cursor.close()
                conn.close()
                
                return results
            
            elif db_type == "mongodb":
                from pymongo import MongoClient
                
                client = MongoClient(f"mongodb://{host}:{port}")
                db = client['admin']
                
                # Get profiling data
                profiling = db.system.profile.find().sort('ts', -1).limit(limit)
                results = []
                
                for doc in profiling:
                    results.append({
                        "operation": doc.get('op'),
                        "collection": doc.get('ns'),
                        "duration_ms": doc.get('millis'),
                        "timestamp": doc.get('ts')
                    })
                
                return results
        
        except Exception as e:
            return [{"error": str(e), "message": "Failed to query slow logs"}]

    @staticmethod
    @tool
    def get_deployment_status(deployment_name: str, namespace: str = "default") -> dict:
        """
        Get Kubernetes deployment status and rollout history.
        
        Args:
            deployment_name: Name of the deployment
            namespace: Kubernetes namespace
        
        Returns:
            dict with deployment and rollout information
        """
        try:
            # Get deployment details
            cmd = f"kubectl get deployment {deployment_name} -n {namespace} -o json"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            deployment = json.loads(result.stdout)
            
            status = {
                "name": deployment_name,
                "replicas": deployment["spec"]["replicas"],
                "ready_replicas": deployment["status"].get("readyReplicas", 0),
                "updated_replicas": deployment["status"].get("updatedReplicas", 0),
                "available_replicas": deployment["status"].get("availableReplicas", 0),
                "conditions": []
            }
            
            for condition in deployment["status"].get("conditions", []):
                status["conditions"].append({
                    "type": condition["type"],
                    "status": condition["status"],
                    "reason": condition.get("reason"),
                    "message": condition.get("message")
                })
            
            # Get rollout history
            cmd = f"kubectl rollout history deployment/{deployment_name} -n {namespace}"
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            status["rollout_history"] = result.stdout
            
            return status
        
        except Exception as e:
            return {"error": str(e), "message": "Failed to get deployment status"}


# Register all tools
tools = [
    FYNDBackendTools.check_pod_status,
    FYNDBackendTools.get_pod_logs,
    FYNDBackendTools.check_kafka_consumer_lag,
    FYNDBackendTools.analyze_redis_memory,
    FYNDBackendTools.query_database_slow_log,
    FYNDBackendTools.get_deployment_status,
]
```

---

### 2. Create Agent Graph

```python
# fynd_agent.py
from langgraph.graph import StateGraph, MessagesState
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.prebuilt import create_react_agent
from langchain_anthropic import ChatAnthropic
from fynd_backend_tools import tools

class FYNDBackendAgent:
    """Agent for FYND backend debugging and optimization"""
    
    def __init__(self):
        self.model = ChatAnthropic(model="claude-3-5-sonnet-20241022")
        self.tools = tools
        self.system_prompt = """You are an expert FYND backend engineer assistant.

Your expertise covers:
- Kubernetes (GKE) deployments and troubleshooting
- Kafka event streaming and consumer patterns
- Redis caching and optimization
- PostgreSQL, MongoDB, and vector databases
- Node.js microservices architecture
- Observability and distributed tracing
- LLM integration and cost optimization

When diagnosing issues:
1. Gather facts using available tools (pod status, logs, metrics)
2. Form hypotheses about root cause
3. Systematically test hypotheses
4. Provide clear remediation steps
5. Suggest permanent monitoring/alerting

Always prioritize:
- Data consistency and correctness
- Zero-downtime solutions
- Cost optimization
- Team knowledge transfer

Be thorough, precise, and security-conscious."""

    def create_agent(self):
        """Create LangGraph agent with tool integration"""
        return create_react_agent(
            self.model,
            self.tools,
            system_prompt=self.system_prompt
        )

    def diagnose_issue(self, problem_description: str) -> str:
        """
        Diagnose a FYND backend issue.
        
        Args:
            problem_description: Description of the issue
        
        Returns:
            Diagnosis and remediation steps
        """
        agent = self.create_agent()
        
        state = {
            "messages": [HumanMessage(content=problem_description)]
        }
        
        # Run agent loop
        output = agent.invoke(state)
        
        # Extract final response
        for message in reversed(output["messages"]):
            if isinstance(message, AIMessage):
                return message.content
        
        return "No response generated"
```

---

### 3. Example Use Cases

```python
# examples.py

# Example 1: Diagnose pod crash
agent = FYNDBackendAgent()
result = agent.diagnose_issue("""
I'm seeing pods in the product-enrichment deployment 
in CrashLoopBackOff status. 
They restart after ~10 seconds.
Can you diagnose the issue?
""")
print("Pod Crash Diagnosis:")
print(result)

# Example 2: Kafka lag investigation
result = agent.diagnose_issue("""
Our product enrichment Kafka consumer group is lagging.
The lag has grown to 50,000 messages over the last hour.
The application doesn't seem to be processing messages.
What could be wrong?
""")
print("\nKafka Lag Investigation:")
print(result)

# Example 3: Memory optimization
result = agent.diagnose_issue("""
We're seeing Redis memory usage at 85% of our 10GB limit.
The eviction policy is LRU.
Looking to optimize without losing critical cache data.
Any recommendations?
""")
print("\nMemory Optimization:")
print(result)
```

---

### 4. Integration with Existing Systems

```python
# slack_integration.py
from slack_sdk import WebClient
from slack_sdk.socket_mode import SocketModeClient
from slack_sdk.socket_mode.request import SocketModeRequest
from slack_sdk.socket_mode.response import SocketModeResponse
import os

class FYNDSlackBot:
    """Slack bot for FYND backend troubleshooting"""
    
    def __init__(self):
        self.slack_token = os.environ.get("SLACK_BOT_TOKEN")
        self.app_token = os.environ.get("SLACK_APP_TOKEN")
        self.client = WebClient(token=self.slack_token)
        self.socket_client = SocketModeClient(
            app_token=self.app_token,
            trace_enabled=True
        )
        self.agent = FYNDBackendAgent()

    def handle_message(self, req: SocketModeRequest):
        """Handle incoming Slack message"""
        if req.type == "events_api":
            event = req.payload["event"]
            
            if event["type"] == "message" and "bot_id" not in event:
                # Get diagnosis from agent
                diagnosis = self.agent.diagnose_issue(event["text"])
                
                # Send response to Slack
                self.client.chat_postMessage(
                    channel=event["channel"],
                    thread_ts=event.get("ts"),
                    text=diagnosis,
                    blocks=[
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": f"```\n{diagnosis}\n```"
                            }
                        }
                    ]
                )

        # Acknowledge the request
        response = SocketModeResponse(envelope_id=req.envelope_id)
        self.socket_client.send_socket_mode_response(response)

    def start(self):
        """Start the bot"""
        self.socket_client.socket_connect()
        self.socket_client.on("events_api", self.handle_message)
        self.socket_client.start()

# Usage
# bot = FYNDSlackBot()
# bot.start()
```

---

### 5. Monitoring & Feedback Loop

```python
# feedback_system.py
from dataclasses import dataclass
from datetime import datetime
import json

@dataclass
class DiagnosisFeedback:
    """Track accuracy of diagnoses for continuous improvement"""
    diagnosis_id: str
    issue_description: str
    ai_diagnosis: str
    actual_root_cause: str
    was_accurate: bool
    time_to_resolution_minutes: int
    timestamp: datetime

class FeedbackCollector:
    """Collect feedback to improve agent"""
    
    def __init__(self, feedback_file: str = "diagnosis_feedback.jsonl"):
        self.feedback_file = feedback_file
    
    def record_feedback(self, feedback: DiagnosisFeedback):
        """Record diagnosis feedback"""
        with open(self.feedback_file, 'a') as f:
            f.write(json.dumps({
                "id": feedback.diagnosis_id,
                "issue": feedback.issue_description,
                "diagnosis": feedback.ai_diagnosis,
                "actual_cause": feedback.actual_root_cause,
                "accurate": feedback.was_accurate,
                "resolution_time": feedback.time_to_resolution_minutes,
                "timestamp": feedback.timestamp.isoformat()
            }) + '\n')
    
    def get_accuracy_metrics(self):
        """Calculate accuracy metrics"""
        correct = 0
        total = 0
        
        with open(self.feedback_file, 'r') as f:
            for line in f:
                entry = json.loads(line)
                total += 1
                if entry.get('accurate'):
                    correct += 1
        
        return {
            "total_diagnoses": total,
            "correct": correct,
            "accuracy_percentage": (correct / total * 100) if total > 0 else 0
        }
```

---

## 🚀 Deployment

### Deploy as Cloud Function

```python
# main.py (Google Cloud Functions)
import functions_framework
from fynd_agent import FYNDBackendAgent
import json

agent = FYNDBackendAgent()

@functions_framework.http
def diagnose_backend_issue(request):
    """HTTP Cloud Function for FYND backend diagnosis"""
    request_json = request.get_json(silent=True)
    
    if not request_json or 'issue' not in request_json:
        return json.dumps({"error": "Missing 'issue' parameter"}), 400
    
    issue = request_json['issue']
    
    try:
        diagnosis = agent.diagnose_issue(issue)
        return json.dumps({
            "status": "success",
            "diagnosis": diagnosis
        })
    except Exception as e:
        return json.dumps({
            "status": "error",
            "message": str(e)
        }), 500
```

Deploy with:
```bash
gcloud functions deploy diagnose-fynd-backend \
  --runtime python311 \
  --trigger-http \
  --entry-point diagnose_backend_issue \
  --set-env-vars ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
```

---

## 📊 Success Metrics

Track these metrics to measure skill effectiveness:

- **Accuracy Rate**: % of diagnoses that match root cause
- **Time Saved**: Minutes from issue report to resolution
- **User Satisfaction**: Feedback score (1-5)
- **Coverage**: % of issue types handled
- **Learning Rate**: Accuracy improvement over time
