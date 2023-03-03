import Excel from "exceljs";
import { Style } from "exceljs";

class ExcelJSWriter {
  private readonly workbook;

  constructor(workbook?: Excel.Workbook) {
    this.workbook = workbook || new Excel.Workbook();
  }

  public addWorksheet(name?: string): ExcelJSWorksheet {
    return new ExcelJSWorksheet(this.workbook.addWorksheet(name));
  }

  public addWorksheet2(name?: string): ExcelJSLinePrinter {
    return new ExcelJSLinePrinter(this.workbook.addWorksheet(name));
  }
}

class ExcelJSWorksheet {
  constructor(private readonly worksheet: Excel.Worksheet) {}

  public setDateCell(address: string, value: Date) {
    this.worksheet.getCell(address).value = value;
  }

  public setStringCell(address: string, value: string) {
    this.worksheet.getCell(address).value = value;
  }

  public setRowHeight(row: number, height: number) {
    this.worksheet.getRow(row).height = height;
  }
}

class ExcelJSLinePrinter {
  private col: number;
  private row: number;
  private currentStyle: Partial<Style>;

  constructor(private readonly worksheet: Excel.Worksheet) {
    this.col = 0;
    this.row = 0;
    this.currentStyle = {};
  }

  public nextRow(opts?: { height?: number }) {
    this.col = 0;
    this.row += 1;

    if (opts?.height) {
      this.worksheet.getRow(this.row).height = opts.height;
    }
    return this;
  }

  public createRange(name: string, style?: Partial<Style>) {
    console.log(name);
    this.currentStyle = style || {};
    return this;
  }

  public addCell(value: Date | string | null, style?: Partial<Style>) {
    this.col += 1;
    this.worksheet.getCell(this.row, this.col).value = value;
    this.worksheet.getCell(this.row, this.col).style = {
      ...this.currentStyle,
      ...style,
    };
    return this;
  }

  public addBlankCell() {
    return this.addCell(null);
  }
  public addBlankCells(n: number) {
    for (let idx = 0; idx < n; idx++) {
      this.addBlankCell();
    }
    return this;
  }
  public rangeComplete() {
    // could add the range to the actual worksheet
    // or could just keep track of in our own structure
    // we'll see
  }
}

export default ExcelJSWriter;