#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CSV Parser — handles quoted fields, commas inside quotes, escaped quotes
// (doubled ""), and newlines inside quoted values.
// ---------------------------------------------------------------------------

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // Look ahead: doubled quote is an escaped quote
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // Not inside quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r') {
      // \r\n or standalone \r
      row.push(field);
      field = '';
      if (i + 1 < text.length && text[i + 1] === '\n') {
        i++;
      }
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush last field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Turn a 2-D array (first row = headers) into an array of objects.
function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0];
  const objects = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j] !== undefined ? rows[i][j] : '';
    }
    objects.push(obj);
  }
  return objects;
}

// Turn an array of objects back into CSV text.
function objectsToCSV(objects) {
  if (objects.length === 0) return '';
  const headers = Object.keys(objects[0]);
  const lines = [headers.map(escapeField).join(',')];
  for (const obj of objects) {
    lines.push(headers.map(h => escapeField(String(obj[h] ?? ''))).join(','));
  }
  return lines.join('\n');
}

// Turn a 2-D array back into CSV text.
function rowsToCSV(rows) {
  return rows.map(row => row.map(escapeField).join(',')).join('\n');
}

function escapeField(value) {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function readInput(filePath) {
  if (filePath === '-') {
    return fs.readFileSync(0, 'utf-8');
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fatal(`File not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function fatal(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
}

function requireArg(args, index, label) {
  if (index >= args.length || args[index] === undefined) {
    fatal(`Missing required argument: <${label}>`);
  }
  return args[index];
}

function findColumnIndex(headers, name) {
  const idx = headers.indexOf(name);
  if (idx === -1) {
    fatal(`Column not found: "${name}". Available columns: ${headers.join(', ')}`);
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

const commands = {};

// csvkit json <file>
commands.json = function (args) {
  const file = requireArg(args, 0, 'file');
  const text = readInput(file);
  const rows = parseCSV(text);
  const objects = rowsToObjects(rows);
  process.stdout.write(JSON.stringify(objects, null, 2) + '\n');
};

// csvkit json2csv <file>
commands.json2csv = function (args) {
  const file = requireArg(args, 0, 'file');
  const text = readInput(file);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    fatal('Invalid JSON input');
  }
  if (!Array.isArray(data) || data.length === 0) {
    fatal('JSON input must be a non-empty array of objects');
  }
  process.stdout.write(objectsToCSV(data) + '\n');
};

// csvkit columns <file>
commands.columns = function (args) {
  const file = requireArg(args, 0, 'file');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length === 0) fatal('Empty CSV');
  process.stdout.write(rows[0].join('\n') + '\n');
};

// csvkit head <file> [n]
commands.head = function (args) {
  const file = requireArg(args, 0, 'file');
  const n = args[1] !== undefined ? parseInt(args[1], 10) : 10;
  if (isNaN(n) || n < 1) fatal('Row count must be a positive integer');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length === 0) fatal('Empty CSV');
  // header + first n data rows
  const slice = rows.slice(0, n + 1);
  process.stdout.write(rowsToCSV(slice) + '\n');
};

// csvkit count <file>
commands.count = function (args) {
  const file = requireArg(args, 0, 'file');
  const text = readInput(file);
  const rows = parseCSV(text);
  // Subtract 1 for header
  const count = rows.length > 0 ? rows.length - 1 : 0;
  process.stdout.write(count + '\n');
};

// csvkit sort <file> <column> [--desc]
commands.sort = function (args) {
  const file = requireArg(args, 0, 'file');
  const column = requireArg(args, 1, 'column');
  const desc = args.includes('--desc');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length < 2) fatal('No data rows to sort');
  const headers = rows[0];
  const colIdx = findColumnIndex(headers, column);
  const dataRows = rows.slice(1);

  dataRows.sort((a, b) => {
    let va = a[colIdx] || '';
    let vb = b[colIdx] || '';
    const na = Number(va);
    const nb = Number(vb);
    if (!isNaN(na) && va !== '' && !isNaN(nb) && vb !== '') {
      return desc ? nb - na : na - nb;
    }
    return desc ? vb.localeCompare(va) : va.localeCompare(vb);
  });

  process.stdout.write(rowsToCSV([headers, ...dataRows]) + '\n');
};

// csvkit filter <file> <column> <value>
commands.filter = function (args) {
  const file = requireArg(args, 0, 'file');
  const column = requireArg(args, 1, 'column');
  const value = requireArg(args, 2, 'value');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length < 2) fatal('No data rows to filter');
  const headers = rows[0];
  const colIdx = findColumnIndex(headers, column);
  const filtered = rows.slice(1).filter(row => (row[colIdx] || '') === value);
  process.stdout.write(rowsToCSV([headers, ...filtered]) + '\n');
};

// csvkit pick <file> <col1,col2,...>
commands.pick = function (args) {
  const file = requireArg(args, 0, 'file');
  const colList = requireArg(args, 1, 'columns');
  const selectedCols = colList.split(',').map(c => c.trim());
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length === 0) fatal('Empty CSV');
  const headers = rows[0];
  const indices = selectedCols.map(name => findColumnIndex(headers, name));
  const picked = rows.map(row => indices.map(i => row[i] || ''));
  process.stdout.write(rowsToCSV(picked) + '\n');
};

// csvkit stats <file> <column>
commands.stats = function (args) {
  const file = requireArg(args, 0, 'file');
  const column = requireArg(args, 1, 'column');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length < 2) fatal('No data rows');
  const headers = rows[0];
  const colIdx = findColumnIndex(headers, column);
  const values = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i][colIdx];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (isNaN(n)) fatal(`Non-numeric value "${raw}" in column "${column}" at row ${i}`);
    values.push(n);
  }
  if (values.length === 0) fatal(`No numeric values in column "${column}"`);
  values.sort((a, b) => a - b);
  const count = values.length;
  const sum = values.reduce((s, v) => s + v, 0);
  const min = values[0];
  const max = values[count - 1];
  const mean = sum / count;
  let median;
  if (count % 2 === 0) {
    median = (values[count / 2 - 1] + values[count / 2]) / 2;
  } else {
    median = values[Math.floor(count / 2)];
  }

  const pad = 8;
  process.stdout.write(
    `count:${String(count).padStart(pad)}\n` +
    `min:${String(min).padStart(pad + 2)}\n` +
    `max:${String(max).padStart(pad + 2)}\n` +
    `sum:${String(sum).padStart(pad + 2)}\n` +
    `mean:${String(Number(mean.toFixed(4))).padStart(pad + 1)}\n` +
    `median:${String(Number(median.toFixed(4))).padStart(pad - 1)}\n`
  );
};

// csvkit unique <file> <column>
commands.unique = function (args) {
  const file = requireArg(args, 0, 'file');
  const column = requireArg(args, 1, 'column');
  const text = readInput(file);
  const rows = parseCSV(text);
  if (rows.length < 2) fatal('No data rows');
  const headers = rows[0];
  const colIdx = findColumnIndex(headers, column);
  const seen = new Set();
  const unique = [];
  for (let i = 1; i < rows.length; i++) {
    const val = rows[i][colIdx] || '';
    if (!seen.has(val)) {
      seen.add(val);
      unique.push(val);
    }
  }
  process.stdout.write(unique.join('\n') + '\n');
};

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(`csvkit-cli v1.0.0 — A zero-dependency CLI for CSV files

Usage: csvkit <command> <file> [options]

Commands:
  json <file>                        Convert CSV to JSON
  json2csv <file>                    Convert JSON array to CSV
  columns <file>                     List column names
  head <file> [n]                    Show first n rows (default 10)
  count <file>                       Count data rows
  sort <file> <column> [--desc]      Sort by column
  filter <file> <column> <value>     Filter rows where column = value
  pick <file> <col1,col2,...>        Select specific columns
  stats <file> <column>              Numeric column statistics
  unique <file> <column>             List unique values in a column

Use "-" as the filename to read from stdin.

Examples:
  csvkit json data.csv
  csvkit head data.csv 5
  csvkit sort data.csv age --desc
  csvkit filter data.csv city "New York"
  csvkit pick data.csv name,email
  csvkit stats data.csv salary
  csvkit filter data.csv active true | csvkit pick - name,email
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  printHelp();
  process.exit(0);
}

if (args[0] === '--version' || args[0] === '-v') {
  process.stdout.write('1.0.0\n');
  process.exit(0);
}

const command = args[0];

if (!commands[command]) {
  fatal(`Unknown command: "${command}". Run "csvkit --help" for usage.`);
}

try {
  commands[command](args.slice(1));
} catch (err) {
  fatal(err.message);
}
