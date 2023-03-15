import {
  Model as WorkbookModel,
  StakeholderModel,
  StockClassModel as WorkbookStockClassModel,
} from "src/workbook/interfaces";

import Calculations from "./calculations";

// When I tried to use "Calculations.OutstandingStockSharesCalculator"
// in a Map generic, I got a "cannot find namespace 'Calculations'"
// error. Until I have time to understand this, I'm importing the
// calculator separately.
import { OutstandingStockSharesCalculator } from "./calculations";

interface StockClassModel extends WorkbookStockClassModel {
  board_approval_date: Date | null;
}

class Model implements WorkbookModel {
  public issuerName = "";
  private stakeholders_: StakeholderModel[] = [];
  private stockClasses_: StockClassModel[] = [];
  private sortedStockClasses_: StockClassModel[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transactionsBySecurityId_ = new Map<string, Set<any>>();
  private issuedSecuritiesByStakeholderAndStockClassIds_ = new Map<
    string,
    Set<string>
  >();

  constructor(
    public readonly asOfDate: Date,
    public readonly generatedAtTimestamp: Date
  ) {}

  // This is required here because an object being "consumed" from
  // the ocf package is by definition "anything". This `any` will
  // likely stick around, but we will look at how we might share a
  // real type / interface here instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public consume(value: any) {
    if (value?.object_type === "ISSUER") {
      this.ISSUER(value);
    }

    if (value?.object_type === "STAKEHOLDER") {
      this.STAKEHOLDER(value);
    }

    if (value?.object_type === "STOCK_CLASS") {
      this.STOCK_CLASS(value);
    }

    if ((value?.object_type ?? "").startsWith("TX_STOCK_")) {
      this.TX_STOCK(value);
    }
  }

  public get stakeholders() {
    return this.stakeholders_;
  }

  public get stockClasses() {
    if (this.sortedStockClasses_.length !== this.stockClasses_.length) {
      this.sortedStockClasses_ = [...this.stockClasses_].sort(
        this.compareClassesForSort
      );
    }

    return this.sortedStockClasses_;
  }

  public getStakeholderStockHoldings(
    stakeholder: StakeholderModel,
    stockClass: WorkbookStockClassModel
  ) {
    const calculator = new OutstandingStockSharesCalculator();

    const issuanceSecurityIds =
      this.issuedSecuritiesByStakeholderAndStockClassIds_.get(
        `${stakeholder.id}/${stockClass.id}`
      ) || new Set();

    for (const id of issuanceSecurityIds) {
      for (const txn of this.transactionsBySecurityId_.get(id) || []) {
        calculator.apply(txn);
      }
    }

    return calculator.value;
  }

  private compareClassesForSort(
    classA: StockClassModel,
    classB: StockClassModel
  ) {
    // Sort criteria 1: Common before preferred
    if (classA.is_preferred !== classB.is_preferred) {
      return classA.is_preferred ? 1 : -1;
    }

    // Sort criteria 2: Older before newer
    const now = new Date();
    const dateDiff: number =
      (classA.board_approval_date ?? now).valueOf() -
      (classB.board_approval_date ?? now).valueOf();

    if (dateDiff !== 0) {
      return dateDiff;
    }

    // Tie-breaker: Sort by name
    return classA.display_name.localeCompare(classB.display_name);
  }

  // This is required on the methods below because an object being
  // "consumed" from the ocf package is by definition "anything".
  // These `anys` may go away because we can define some
  // expectations about the shape of specific objects, but for now
  // we'll do this.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ISSUER(value: any) {
    if ("dba" in value) {
      this.issuerName = `${value.dba}`;
    } else if ("legal_name" in value) {
      this.issuerName = `${value.legal_name}`;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private STAKEHOLDER(value: any) {
    this.stakeholders_.push({
      id: value?.id,
      display_name: value?.name?.legal_name || " - ",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private STOCK_CLASS(value: any) {
    const conversion_ratio = this.getStockClassConversionRatio(
      value?.conversion_rights
    );

    let board_approval_date = null;

    if (value?.board_approval_date) {
      board_approval_date = new Date(value.board_approval_date);
    }
    this.stockClasses_.push({
      id: value?.id,
      display_name: value?.name,
      is_preferred: value?.class_type !== "COMMON",
      conversion_ratio,
      board_approval_date,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private TX_STOCK(value: any) {
    if (value.object_type === "TX_STOCK_ISSUANCE") {
      const key = `${value.stakeholder_id}/${value.stock_class_id}`;
      const ids =
        this.issuedSecuritiesByStakeholderAndStockClassIds_.get(key) ||
        new Set();
      ids.add(value.security_id);
      this.issuedSecuritiesByStakeholderAndStockClassIds_.set(key, ids);
    }

    const txns =
      this.transactionsBySecurityId_.get(value.security_id) || new Set();
    txns.add(value);
    this.transactionsBySecurityId_.set(value.security_id, txns);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getStockClassConversionRatio(value: any): number {
    const mechanism = Array.of(value).flat()[0]?.conversion_mechanism;
    if (mechanism?.ratio === null || mechanism?.type !== "RATIO_CONVERSION") {
      return 1;
    }

    // TODO: The toNumber call here is necessary because we have `number` on the
    // interface between the model and the workbook. However, we should probably
    // look at putting the `Big` types directly on the interface to avoid
    // precision loss.
    return Calculations.convertRatioToDecimalNumber(mechanism.ratio).toNumber();
  }
}

export default Model;
