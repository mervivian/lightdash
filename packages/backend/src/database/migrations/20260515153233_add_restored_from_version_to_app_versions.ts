import { type Knex } from 'knex';
import { AppVersionsTableName } from '../entities/apps';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        // Source version number for a rollback. Null on every generated
        // version; non-null means this row was duplicated from that source
        // version via the restore action. Not a FK to app_versions because
        // (app_id, version) is a composite natural key, not the PK — and
        // the value is informational (we never cascade from it).
        table.integer('restored_from_version').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(AppVersionsTableName, (table) => {
        table.dropColumn('restored_from_version');
    });
}
