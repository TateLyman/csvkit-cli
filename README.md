# csvkit-cli

A zero-dependency CLI for working with CSV files. Convert, filter, sort, slice, and analyze CSV data from your terminal.

## Install

```bash
npm install -g csvkit-cli
```

## Commands

### `csvkit json <file.csv>`

Convert a CSV file to JSON (array of objects).

```bash
csvkit json data.csv
# [{"name":"Alice","age":"30"},{"name":"Bob","age":"25"}]

csvkit json data.csv > output.json
```

### `csvkit json2csv <file.json>`

Convert a JSON array of objects to CSV.

```bash
csvkit json2csv data.json
# name,age
# Alice,30
# Bob,25

csvkit json2csv data.json > output.csv
```

### `csvkit columns <file.csv>`

List the column names in a CSV file.

```bash
csvkit columns data.csv
# name
# age
# city
```

### `csvkit head <file.csv> [n]`

Show the first n rows (default 10). Outputs as formatted CSV.

```bash
csvkit head data.csv
csvkit head data.csv 5
```

### `csvkit count <file.csv>`

Count the number of data rows (excludes header).

```bash
csvkit count data.csv
# 1542
```

### `csvkit sort <file.csv> <column> [--desc]`

Sort rows by a column. Detects numeric values automatically.

```bash
csvkit sort data.csv age
csvkit sort data.csv age --desc
```

### `csvkit filter <file.csv> <column> <value>`

Filter rows where a column equals a given value.

```bash
csvkit filter data.csv city "New York"
csvkit filter data.csv active true
```

### `csvkit pick <file.csv> <col1,col2,...>`

Select specific columns from a CSV file.

```bash
csvkit pick data.csv name,age
csvkit pick data.csv "first name,last name,email"
```

### `csvkit stats <file.csv> <column>`

Show basic statistics for a numeric column: min, max, mean, median, sum, and count.

```bash
csvkit stats data.csv age
# count:  100
# min:    18
# max:    65
# sum:    3842
# mean:   38.42
# median: 37
```

### `csvkit unique <file.csv> <column>`

List unique values in a column.

```bash
csvkit unique data.csv city
# New York
# Los Angeles
# Chicago
```

## Piping

All commands output to stdout, so you can pipe them into other tools:

```bash
csvkit filter data.csv status active | csvkit sort - name | csvkit pick - name,email
csvkit json data.csv | jq '.[0]'
csvkit json2csv data.json | csvkit count -
```

Use `-` as the filename to read from stdin.

## CSV Parsing

The built-in parser handles:

- Quoted fields containing commas: `"New York, NY"`
- Escaped quotes: `"She said ""hello"""`
- Newlines inside quoted fields
- Mixed quoted and unquoted fields

## Requirements

Node.js >= 14.0.0. No dependencies.

## License

MIT
