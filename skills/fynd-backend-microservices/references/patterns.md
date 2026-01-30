# FYND Backend Patterns

**Pod Crash:**
kubectl logs POD --tail=50
kubectl describe pod POD

**Kafka Lag:**
kafka-consumer-groups --group GROUP --describe

**Redis Memory:**
redis-cli --memkeys
redis-cli MEMORY DOCTOR
