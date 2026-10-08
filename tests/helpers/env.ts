import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** MUST be the first import in every test file: ESM evaluation order
 *  guarantees this runs before src/db/index opens the database. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noter-test-"));
process.env.NOTER_DB = path.join(dir, "test.db");
