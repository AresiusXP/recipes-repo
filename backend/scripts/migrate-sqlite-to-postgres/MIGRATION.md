# SQLite → PostgreSQL Migration Guide

This document describes the safe, zero-data-loss procedure for migrating from the
legacy SQLite database to the new PostgreSQL database.

## Prerequisites

- The new PostgreSQL pod is deployed and healthy (via the `recipes-db` Helm release).
- You have `kubectl` access to the cluster.
- You have a copy of the SQLite database file (`recipes.db`) from the running pod.
- Node.js 20+ is available on the machine running the migration script.

---

## Step 1 — Back up the SQLite database

```bash
# Copy the SQLite file out of the running pod
kubectl cp <old-pod-name>:/app/data/recipes.db ./recipes-backup-$(date +%Y%m%d).db

# Verify the backup is readable
sqlite3 ./recipes-backup-$(date +%Y%m%d).db "SELECT COUNT(*) FROM Recipe;"
```

**Keep this backup until you are fully confident the migration succeeded.**

---

## Step 2 — Scale the old app pod to zero (maintenance window)

```bash
kubectl scale deployment <old-deployment-name> --replicas=0
```

This prevents any new writes to SQLite during the migration.

---

## Step 3 — Deploy PostgreSQL

```bash
helm upgrade --install recipes-db oci://registry-1.docker.io/cloudpirates/postgres \
  --namespace recipes \
  --values helm/recipes-db/values.yaml \
  --wait
```

Verify the pod is ready:

```bash
kubectl get pods -n recipes -l app.kubernetes.io/name=postgres
```

---

## Step 4 — Run the migration script as a Kubernetes Job

Create a Job that runs the migration script against the live cluster:

```bash
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: sqlite-to-postgres-migration
  namespace: recipes
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrator
          image: node:20-bookworm-slim
          command:
            - /bin/sh
            - -c
            - |
              apt-get update -qq && apt-get install -y -qq sqlite3 && \
              cd /migration && npm install --silent && \
              node migrate.mjs \
                --sqlite /data/recipes.db \
                --postgres "\$DATABASE_URL"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: recipes-postgres-secret
                  key: uri
          volumeMounts:
            - name: sqlite-data
              mountPath: /data
            - name: migration-script
              mountPath: /migration
      volumes:
        - name: sqlite-data
          persistentVolumeClaim:
            claimName: <old-data-pvc-name>
        - name: migration-script
          configMap:
            name: sqlite-migration-script
EOF
```

Alternatively, run the script locally if you have the SQLite file and PostgreSQL access:

```bash
cd backend/scripts/migrate-sqlite-to-postgres
npm install
node migrate.mjs \
  --sqlite /path/to/recipes-backup.db \
  --postgres "postgresql://recipes:password@localhost:5432/recipes"
```

---

## Step 5 — Verify row counts

The migration script prints a verification table at the end. Confirm all counts match:

```
✅ User: SQLite=12, PostgreSQL=12
✅ Recipe: SQLite=347, PostgreSQL=347
✅ Tag: SQLite=89, PostgreSQL=89
...
```

You can also verify manually:

```bash
# Connect to PostgreSQL
kubectl exec -it <postgres-pod> -- psql -U recipes -d recipes -c \
  'SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;'
```

---

## Step 6 — Deploy the new backend

```bash
helm upgrade --install recipes-backend helm/recipes-backend \
  --namespace recipes \
  --values helm/recipes-backend/values.yaml \
  --wait
```

The backend's initContainer runs `prisma migrate deploy` to apply the schema.

---

## Step 7 — Deploy the new frontend and scraper

```bash
helm upgrade --install recipes-frontend helm/recipes-frontend \
  --namespace recipes \
  --values helm/recipes-frontend/values.yaml \
  --wait

helm upgrade --install recipes-scraper helm/recipes-scraper \
  --namespace recipes \
  --values helm/recipes-scraper/values.yaml \
  --wait
```

---

## Step 8 — Smoke test

1. Open the application in your browser.
2. Verify you can log in.
3. Verify your recipes are visible.
4. Import a new recipe from a URL and confirm the async import flow works.

---

## Rollback procedure

If anything goes wrong **before Step 6** (before the new backend is deployed):

```bash
# Scale the old app pod back up
kubectl scale deployment <old-deployment-name> --replicas=1
```

The SQLite database is untouched — the old app will resume normally.

If the new backend is already deployed and something is wrong:

1. Scale the new backend to 0.
2. Scale the old app back up.
3. Investigate the PostgreSQL data before retrying.

---

## Cleanup (after successful migration)

Once you are confident the migration is complete and the new stack is stable:

```bash
# Delete the old deployment and its data PVC
kubectl delete deployment <old-deployment-name> -n recipes
kubectl delete pvc <old-data-pvc-name> -n recipes

# Delete the migration Job
kubectl delete job sqlite-to-postgres-migration -n recipes
```
