# MongoDB deployment requirement

Contract approval submission and approval/rejection decisions update a workflow instance and its contract record in one MongoDB transaction. The API therefore requires MongoDB to run as a replica set or through a sharded cluster (mongos). A standalone mongod instance cannot execute these operations.

## Local single-node replica set

Start MongoDB 7 in a single-node replica set:

```sh
docker run --detach --name contractsphere-mongo --publish 27017:27017 mongo:7.0 mongod --replSet rs0 --bind_ip_all
docker exec contractsphere-mongo mongosh --quiet --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})'
```

Configure the API:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/contractsphere?replicaSet=rs0
```

Wait until `db.hello().isWritablePrimary` returns `true` before starting the API. To check from the host:

```sh
mongosh "mongodb://127.0.0.1:27017/admin?replicaSet=rs0" --quiet --eval 'db.hello().isWritablePrimary'
```

## Managed environments

Use the provider's replica-set or sharded-cluster connection string. For MongoDB Atlas, use the standard SRV connection string and do not remove the replica-set topology parameters supplied by the provider. Ensure the database user has the required read/write privileges on the application database.

## CI

GitHub Actions starts an ephemeral MongoDB 7 single-node replica set, waits for primary election, and runs the API integration tests against it. The suite includes a rollback regression test for a contract state conflict during approval.

Do not point automated tests at a production database. CI uses a dedicated ephemeral database name.