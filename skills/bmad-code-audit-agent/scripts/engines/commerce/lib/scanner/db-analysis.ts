/**
 * Database Analysis:
 * SQL dump streaming parser and database-specific scan functions.
 */
import * as fs from 'fs';
import * as readline from 'readline';
import { ScanContext, TableInfo, ColumnInfo, IndexInfo, ForeignKeyInfo } from './types';

// ==================== SQL DUMP PARSER ====================

export async function parseSqlDump(
  filePath: string,
  onProgress?: (pct: number) => void
): Promise<Record<string, TableInfo>> {
  const tables: Record<string, TableInfo> = {};
  const stats = fs.statSync(filePath);
  const totalBytes = stats.size;
  let bytesRead = 0;
  let currentTable = '';
  let inCreate = false;
  let createBuffer: string[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    bytesRead += Buffer.byteLength(line, 'utf-8') + 1;

    if (onProgress && totalBytes > 0) {
      const pct = Math.round((bytesRead / totalBytes) * 100);
      if (pct % 5 === 0) onProgress(pct);
    }

    const trimmed = line.trim();

    // Start of CREATE TABLE
    const createMatch = trimmed.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/i);
    if (createMatch) {
      currentTable = createMatch[1];
      inCreate = true;
      createBuffer = [];
      tables[currentTable] = {
        name: currentTable,
        engine: 'InnoDB',
        charset: 'utf8mb4',
        columns: [],
        indexes: [],
        foreignKeys: [],
        rowFormat: '',
      };
      continue;
    }

    if (inCreate) {
      createBuffer.push(trimmed);

      // End of CREATE TABLE
      if (/^\)\s*(ENGINE|;)/i.test(trimmed) || trimmed === ');') {
        inCreate = false;
        const fullCreate = createBuffer.join('\n');
        parseCreateBody(tables[currentTable], fullCreate);

        // Extract engine/charset from trailing options
        const engineM = trimmed.match(/ENGINE\s*=\s*(\w+)/i);
        if (engineM) tables[currentTable].engine = engineM[1];
        const charsetM = trimmed.match(/(?:DEFAULT\s+)?CHARSET\s*=\s*(\w+)/i);
        if (charsetM) tables[currentTable].charset = charsetM[1];
        const rowFmtM = trimmed.match(/ROW_FORMAT\s*=\s*(\w+)/i);
        if (rowFmtM) tables[currentTable].rowFormat = rowFmtM[1];
        continue;
      }
    }
  }

  return tables;
}

function parseCreateBody(table: TableInfo, body: string): void {
  const lines = body.split('\n');

  for (const raw of lines) {
    const line = raw.trim().replace(/,\s*$/, '');

    // Column definition
    const colM = line.match(/^`(\w+)`\s+(\w+(?:\([^)]+\))?)\s*(.*)/i);
    if (colM && !line.startsWith('PRIMARY') && !line.startsWith('KEY') &&
        !line.startsWith('UNIQUE') && !line.startsWith('INDEX') && !line.startsWith('CONSTRAINT') &&
        !line.startsWith('FULLTEXT') && !line.startsWith('SPATIAL')) {
      const col: ColumnInfo = {
        name: colM[1],
        type: colM[2],
        nullable: !/ NOT\s+NULL/i.test(colM[3]),
        hasDefault: /DEFAULT\s/i.test(colM[3]),
        comment: '',
      };
      const commentM = colM[3].match(/COMMENT\s+'([^']+)'/i);
      if (commentM) col.comment = commentM[1];
      table.columns.push(col);
      continue;
    }

    // Primary key
    const pkM = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (pkM) {
      table.indexes.push({
        name: 'PRIMARY',
        columns: pkM[1].replace(/`/g, '').split(',').map((s) => s.trim()),
        type: 'PRIMARY',
      });
      continue;
    }

    // Unique index
    const uqM = line.match(/^UNIQUE\s+(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (uqM) {
      table.indexes.push({
        name: uqM[1],
        columns: uqM[2].replace(/`/g, '').split(',').map((s) => s.trim()),
        type: 'UNIQUE',
      });
      continue;
    }

    // Regular index / KEY
    const keyM = line.match(/^(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (keyM) {
      table.indexes.push({
        name: keyM[1],
        columns: keyM[2].replace(/`/g, '').split(',').map((s) => s.trim()),
        type: 'INDEX',
      });
      continue;
    }

    // Fulltext
    const ftM = line.match(/^FULLTEXT\s+(?:KEY|INDEX)\s+`?(\w+)`?\s*\(([^)]+)\)/i);
    if (ftM) {
      table.indexes.push({
        name: ftM[1],
        columns: ftM[2].replace(/`/g, '').split(',').map((s) => s.trim()),
        type: 'FULLTEXT',
      });
      continue;
    }

    // Foreign key
    const fkM = line.match(/^CONSTRAINT\s+`?(\w+)`?\s+FOREIGN\s+KEY\s*\(`?(\w+)`?\)\s*REFERENCES\s+`?(\w+)`?\s*\(`?(\w+)`?\)/i);
    if (fkM) {
      const onDeleteM = line.match(/ON\s+DELETE\s+(\w+(?:\s+\w+)?)/i);
      const onUpdateM = line.match(/ON\s+UPDATE\s+(\w+(?:\s+\w+)?)/i);
      table.foreignKeys.push({
        name: fkM[1],
        column: fkM[2],
        refTable: fkM[3],
        refColumn: fkM[4],
        onDelete: onDeleteM?.[1] || 'RESTRICT',
        onUpdate: onUpdateM?.[1] || 'RESTRICT',
      });
    }
  }
}

// ==================== DB SCAN FUNCTIONS ====================

export function dbscanTableStructure(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Structure';
  for (const [name, t] of Object.entries(tables)) {
    if (t.columns.length > 60) {
      ctx.dbAdd(CAT, name, 0,
        `Wide Table: ${t.columns.length} columns`,
        `Table ${name} has ${t.columns.length} columns — denormalized or needs vertical split`,
        'MEDIUM', 'Consider splitting into main + extension attribute table. Review EAV usage.');
    }
    if (t.columns.length === 0) {
      ctx.dbAdd(CAT, name, 0,
        `Empty Table Definition: ${name}`,
        `Table ${name} parsed with 0 columns — possible parse issue or truly empty DDL`,
        'LOW', 'Verify table definition in the dump file.');
    }
  }
}

export function dbscanIndexes(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Indexes';
  for (const [name, t] of Object.entries(tables)) {
    const hasPk = t.indexes.some((i) => i.type === 'PRIMARY');
    if (!hasPk) {
      ctx.dbAdd(CAT, name, 0,
        `Missing Primary Key: ${name}`,
        `Table ${name} has no PRIMARY KEY — full table scans, replication issues`,
        'CRITICAL', 'Add an appropriate primary key (auto-increment id or natural key).');
    }

    // Duplicate indexes (same leading columns)
    const indexSigs: Record<string, string> = {};
    for (const idx of t.indexes) {
      const sig = idx.columns.slice(0, 2).join(',');
      if (indexSigs[sig] && idx.type !== 'PRIMARY') {
        ctx.dbAdd(CAT, name, 0,
          `Redundant Index: ${idx.name} (covers same prefix as ${indexSigs[sig]})`,
          `Index ${idx.name} on (${idx.columns.join(',')}) is redundant with ${indexSigs[sig]}`,
          'MEDIUM', 'Remove the shorter/redundant index to reduce write overhead.');
      } else {
        indexSigs[sig] = idx.name;
      }
    }

    // Too many indexes
    if (t.indexes.length > 10) {
      ctx.dbAdd(CAT, name, 0,
        `Excessive Indexes: ${t.indexes.length} on ${name}`,
        `Table has ${t.indexes.length} indexes — write performance penalty`,
        'MEDIUM', 'Review index usage. Remove indexes not used by any query.');
    }
  }
}

export function dbscanColumns(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Columns';
  for (const [name, t] of Object.entries(tables)) {
    for (const col of t.columns) {
      // TEXT/BLOB without need
      if (/^(text|mediumtext|longtext|blob|mediumblob|longblob)$/i.test(col.type)) {
        ctx.dbAdd(CAT, name, 0,
          `Large Column Type: ${name}.${col.name} (${col.type})`,
          `Column ${col.name} uses ${col.type} — verify if VARCHAR(N) would suffice`,
          'LOW', 'Use VARCHAR with appropriate length when max size is known.');
      }

      // Nullable columns that probably shouldn't be
      if (col.nullable && /^(status|type|is_|flag|enabled|active)/.test(col.name)) {
        ctx.dbAdd(CAT, name, 0,
          `Nullable Flag/Status Column: ${name}.${col.name}`,
          `Column ${col.name} allows NULL — status/flag columns should have a NOT NULL default`,
          'LOW', 'Add NOT NULL with DEFAULT value for deterministic queries.');
      }
    }
  }
}

export function dbscanForeignKeys(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Foreign Keys';
  for (const [name, t] of Object.entries(tables)) {
    for (const fk of t.foreignKeys) {
      if (fk.onDelete.toUpperCase() === 'CASCADE') {
        // Check if cascading on a large/critical table
        if (/(order|quote|customer|catalog_product|catalog_category|inventory)/.test(fk.refTable)) {
          ctx.dbAdd(CAT, name, 0,
            `CASCADE DELETE on Critical Table: ${fk.name}`,
            `FK ${fk.name} cascades deletes from ${fk.refTable} — can cause mass data loss`,
            'HIGH', 'Consider SET NULL or application-level cascade with soft-delete for critical data.');
        }
      }

      // FK references non-existent table in dump
      if (!tables[fk.refTable]) {
        ctx.dbAdd(CAT, name, 0,
          `FK References Missing Table: ${fk.name} → ${fk.refTable}`,
          `Foreign key references table ${fk.refTable} which is not in the dump`,
          'MEDIUM', 'Verify referenced table exists. May be a partial dump or orphaned FK.');
      }
    }
  }
}

export function dbscanNaming(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Naming';
  for (const [name] of Object.entries(tables)) {
    // Custom tables should have vendor prefix
    if (!name.startsWith('catalog_') && !name.startsWith('sales_') && !name.startsWith('customer_') &&
        !name.startsWith('eav_') && !name.startsWith('store_') && !name.startsWith('cms_') &&
        !name.startsWith('directory_') && !name.startsWith('email_') && !name.startsWith('flag') &&
        !name.startsWith('admin_') && !name.startsWith('integration_') && !name.startsWith('oauth_') &&
        !name.startsWith('quote') && !name.startsWith('review') && !name.startsWith('search_') &&
        !name.startsWith('url_rewrite') && !name.startsWith('wishlist') && !name.startsWith('inventory_') &&
        !name.startsWith('indexer_') && !name.startsWith('cron_') && !name.startsWith('cache') &&
        !name.startsWith('session') && !name.startsWith('newsletter_') && !name.startsWith('reporting_') &&
        !name.startsWith('ui_bookmark') && !name.startsWith('variable') && !name.startsWith('widget') &&
        !name.startsWith('tax_') && !name.startsWith('shipping_') && !name.startsWith('paypal_') &&
        !name.startsWith('captcha') && !name.startsWith('authorization_') && !name.startsWith('vault_') &&
        !name.startsWith('queue') && !name.startsWith('magento_') && !name.startsWith('patch_') &&
        !name.startsWith('setup_') && !name.startsWith('analytics_') && !name.startsWith('import_') &&
        !name.startsWith('export_') && !name.startsWith('weee_') && !name.startsWith('downloadable_')) {
      // Likely custom table — check naming convention
      if (!name.includes('_') || name.split('_').length < 2) {
        ctx.dbAdd(CAT, name, 0,
          `Non-Standard Table Name: ${name}`,
          `Custom table "${name}" doesn't follow vendor_module_entity naming convention`,
          'LOW', 'Rename to vendor_module_entity format for clarity and conflict avoidance.');
      }
    }
  }
}

export function dbscanEngines(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Engines';
  for (const [name, t] of Object.entries(tables)) {
    if (t.engine && t.engine.toUpperCase() !== 'INNODB') {
      ctx.dbAdd(CAT, name, 0,
        `Non-InnoDB Engine: ${name} uses ${t.engine}`,
        `Table uses ${t.engine} — lacks transactions, row-level locking, crash recovery`,
        'HIGH', 'Convert to InnoDB: ALTER TABLE ' + name + ' ENGINE=InnoDB;');
    }
  }
}

export function dbscanCharset(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Charset';
  for (const [name, t] of Object.entries(tables)) {
    if (t.charset && !t.charset.startsWith('utf8mb4') && t.charset !== 'utf8mb4') {
      ctx.dbAdd(CAT, name, 0,
        `Non-UTF8MB4 Charset: ${name} (${t.charset})`,
        `Table charset is ${t.charset} — cannot store emojis/4-byte Unicode, potential data loss`,
        'MEDIUM', 'Convert: ALTER TABLE ' + name + ' CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
    }
  }
}

export function dbscanMagentoSchema(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Magento Schema Patterns';
  for (const [name, t] of Object.entries(tables)) {
    // EAV tables without proper indexes
    if (name.includes('_entity_') && (name.includes('_int') || name.includes('_varchar') || name.includes('_decimal') || name.includes('_text') || name.includes('_datetime'))) {
      const hasEntityAttrIdx = t.indexes.some((i) => i.columns.includes('entity_id') && i.columns.includes('attribute_id'));
      if (!hasEntityAttrIdx) {
        ctx.dbAdd(CAT, name, 0,
          `EAV Table Missing Composite Index: ${name}`,
          'EAV value table missing (entity_id, attribute_id) index — slow attribute lookups',
          'HIGH', 'Add index on (entity_id, attribute_id, store_id) for optimal EAV queries.');
      }
    }
  }
}

export function dbscanIntegrity(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Integrity';
  // Check for potential orphan relationships
  const allTableNames = new Set(Object.keys(tables));
  for (const [name, t] of Object.entries(tables)) {
    for (const col of t.columns) {
      // Columns ending in _id that don't have FK defined
      if (col.name.endsWith('_id') && col.name !== 'entity_id' && col.name !== 'row_id') {
        const hasFk = t.foreignKeys.some((fk) => fk.column === col.name);
        if (!hasFk) {
          // Guess the referenced table
          const possibleRef = col.name.replace(/_id$/, '');
          if (allTableNames.has(possibleRef) || allTableNames.has(possibleRef + 's')) {
            ctx.dbAdd(CAT, name, 0,
              `Missing FK: ${name}.${col.name}`,
              `Column ${col.name} looks like a reference but has no FK constraint — orphan rows possible`,
              'LOW', 'Add FK or document why it is intentionally absent (e.g., cross-database reference).');
          }
        }
      }
    }
  }
}

export function dbscanPerformance(ctx: ScanContext, tables: Record<string, TableInfo>): void {
  const CAT = 'Database Performance';
  for (const [name, t] of Object.entries(tables)) {
    // Tables with many columns + no covering index on common patterns
    const intCols = t.columns.filter((c) => /^(int|bigint|smallint|tinyint)/i.test(c.type));
    const indexedCols = new Set(t.indexes.flatMap((i) => i.columns));

    // Flag commonly-filtered columns without index
    for (const col of t.columns) {
      if (['store_id', 'website_id', 'customer_group_id', 'status', 'state', 'is_active', 'created_at', 'updated_at'].includes(col.name)) {
        if (!indexedCols.has(col.name)) {
          ctx.dbAdd(CAT, name, 0,
            `Common Filter Column Not Indexed: ${name}.${col.name}`,
            `Column ${col.name} is commonly filtered/sorted but has no index`,
            'MEDIUM', `Add index on ${col.name} if queries filter or sort by it frequently.`);
        }
      }
    }
  }
}
