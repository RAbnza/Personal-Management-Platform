import { Pool } from "pg";

import { getServerEnvironment } from "@/platform/env/server";
import { logOperationalEvent } from "@/platform/observability/logger";

type RuntimeDatabasePools = {
  domain: Pool;
  auth: Pool;
};

const globalForDatabase = globalThis as typeof globalThis & {
  __pmpRuntimeDatabasePools?: RuntimeDatabasePools;
};

let productionDatabasePools: RuntimeDatabasePools | undefined;

function createPool(connectionString: string, applicationName: string) {
  const pool = new Pool({
    connectionString,
    application_name: applicationName,
  });

  pool.on("error", () => {
    logOperationalEvent("database_idle_error");
  });

  return pool;
}

function createRuntimeDatabasePools(): RuntimeDatabasePools {
  const environment = getServerEnvironment();

  return {
    domain: createPool(environment.DATABASE_URL, "pmp-web-domain"),
    auth: createPool(environment.AUTH_DATABASE_URL, "pmp-web-auth"),
  };
}

function getRuntimeDatabasePools(): RuntimeDatabasePools {
  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.__pmpRuntimeDatabasePools ??=
      createRuntimeDatabasePools();

    return globalForDatabase.__pmpRuntimeDatabasePools;
  }

  productionDatabasePools ??= createRuntimeDatabasePools();

  return productionDatabasePools;
}

export function getDomainPool(): Pool {
  return getRuntimeDatabasePools().domain;
}

export function getAuthPool(): Pool {
  return getRuntimeDatabasePools().auth;
}

export async function closeRuntimeDatabasePools(): Promise<void> {
  const pools =
    process.env.NODE_ENV !== "production"
      ? globalForDatabase.__pmpRuntimeDatabasePools
      : productionDatabasePools;

  if (!pools) {
    return;
  }

  await Promise.all([pools.domain.end(), pools.auth.end()]);

  if (process.env.NODE_ENV !== "production") {
    delete globalForDatabase.__pmpRuntimeDatabasePools;
  } else {
    productionDatabasePools = undefined;
  }
}
