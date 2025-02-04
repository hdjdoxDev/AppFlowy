import React from 'react';
import {
  FieldType,
  NumberFormat,
  NumberTypeOptionPB,
  SelectOptionCellDataPB,
  ViewLayoutTypePB,
} from '../../../services/backend';
import { Log } from '../../utils/log';
import {
  assertFieldName,
  assertNumberOfFields,
  assertNumberOfRows,
  assertTextCell,
  createSingleSelectOptions,
  createTestDatabaseView,
  editTextCell,
  findFirstFieldInfoWithFieldType,
  makeMultiSelectCellController,
  makeSingleSelectCellController,
  makeTextCellController,
  openTestDatabase,
} from './DatabaseTestHelper';
import { SelectOptionCellBackendService } from '../../stores/effects/database/cell/select_option_bd_svc';
import { TypeOptionController } from '../../stores/effects/database/field/type_option/type_option_controller';
import { None, Some } from 'ts-results';
import { RowBackendService } from '../../stores/effects/database/row/row_bd_svc';
import { makeNumberTypeOptionContext } from '../../stores/effects/database/field/type_option/type_option_context';

export const RunAllGridTests = () => {
  async function run() {
    await createBuildInGrid();
    await testEditGridRow();
    await testCreateRow();
    await testDeleteRow();
    await testCreateOptionInCell();
    await testGetSingleSelectFieldData();
    await testSwitchFromSingleSelectToNumber();
    await testSwitchFromMultiSelectToRichText();
    await testEditField();
    await testCreateNewField();
    await testDeleteField();
  }

  return (
    <React.Fragment>
      <div>
        <button className='rounded-md bg-red-400 p-4' type='button' onClick={() => run()}>
          Run all grid tests
        </button>
      </div>
    </React.Fragment>
  );
};

async function createBuildInGrid() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  databaseController.subscribe({
    onViewChanged: (databasePB) => {
      Log.debug('Did receive database:' + databasePB);
    },
    // onRowsChanged: async (rows) => {
    //   if (rows.length !== 3) {
    //     throw Error('Expected number of rows is 3, but receive ' + rows.length);
    //   }
    // },
    onFieldsChanged: (fields) => {
      if (fields.length !== 3) {
        throw Error('Expected number of fields is 3, but receive ' + fields.length);
      }
    },
  });
  await databaseController.open().then((result) => result.unwrap());
  await databaseController.dispose();
}

async function testEditGridRow() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  for (const [index, row] of databaseController.databaseViewCache.rowInfos.entries()) {
    const cellContent = index.toString();
    const fieldInfo = findFirstFieldInfoWithFieldType(row, FieldType.RichText).unwrap();
    await editTextCell(fieldInfo.field.id, row, databaseController, cellContent);
    await assertTextCell(fieldInfo.field.id, row, databaseController, cellContent);
  }
}

async function testCreateRow() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());
  await assertNumberOfRows(view.id, 3);

  // Create a row from a DatabaseController or create using the RowBackendService
  await databaseController.createRow();
  await assertNumberOfRows(view.id, 4);
  await databaseController.dispose();
}

async function testDeleteRow() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  const rows = databaseController.databaseViewCache.rowInfos;
  const svc = new RowBackendService(view.id);
  await svc.deleteRow(rows[0].row.id);
  await assertNumberOfRows(view.id, 2);

  // Wait the databaseViewCache get the change notification and
  // update the rows.
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (databaseController.databaseViewCache.rowInfos.length !== 2) {
    throw Error('The number of rows is not match');
  }
  await databaseController.dispose();
}

async function testCreateOptionInCell() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());
  for (const [index, row] of databaseController.databaseViewCache.rowInfos.entries()) {
    if (index === 0) {
      const fieldInfo = findFirstFieldInfoWithFieldType(row, FieldType.SingleSelect).unwrap();
      const cellController = await makeSingleSelectCellController(fieldInfo.field.id, row, databaseController).then(
        (result) => result.unwrap()
      );
      await cellController.subscribeChanged({
        onCellChanged: (value) => {
          if (value.some) {
            const option: SelectOptionCellDataPB = value.unwrap();
            console.log(option);
          }
        },
      });
      const backendSvc = new SelectOptionCellBackendService(cellController.cellIdentifier);
      await backendSvc.createOption({ name: 'option' + index });
      await cellController.dispose();
    }
  }
  await databaseController.dispose();
}

async function testGetSingleSelectFieldData() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  // Find the single select column
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const singleSelect = databaseController.fieldController.fieldInfos.find(
    (fieldInfo) => fieldInfo.field.field_type === FieldType.SingleSelect
  )!;

  // Create options
  const singleSelectTypeOptionContext = await createSingleSelectOptions(view.id, singleSelect, [
    'Task 1',
    'Task 2',
    'Task 3',
  ]);

  // Read options
  const options = await singleSelectTypeOptionContext.getTypeOption().then((result) => result.unwrap());
  console.log(options);

  await databaseController.dispose();
}

async function testSwitchFromSingleSelectToNumber() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  // Find the single select column
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const singleSelect = databaseController.fieldController.fieldInfos.find(
    (fieldInfo) => fieldInfo.field.field_type === FieldType.SingleSelect
  )!;
  const typeOptionController = new TypeOptionController(view.id, Some(singleSelect));
  await typeOptionController.switchToField(FieldType.Number);

  // Check the number type option
  const numberTypeOptionContext = makeNumberTypeOptionContext(typeOptionController);
  const numberTypeOption: NumberTypeOptionPB = await numberTypeOptionContext
    .getTypeOption()
    .then((result) => result.unwrap());
  const format: NumberFormat = numberTypeOption.format;
  if (format !== NumberFormat.Num) {
    throw Error('The default format should be number');
  }

  await databaseController.dispose();
}

async function testSwitchFromMultiSelectToRichText() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  // Create multi-select field
  const typeOptionController = new TypeOptionController(view.id, None, FieldType.MultiSelect);
  await typeOptionController.initialize();

  // Insert options to first row
  const row = databaseController.databaseViewCache.rowInfos[0];
  const multiSelectField = typeOptionController.getFieldInfo();
  // const multiSelectField = findFirstFieldInfoWithFieldType(row, FieldType.MultiSelect).unwrap();
  const selectOptionCellController = await makeMultiSelectCellController(
    multiSelectField.field.id,
    row,
    databaseController
  ).then((result) => result.unwrap());
  const backendSvc = new SelectOptionCellBackendService(selectOptionCellController.cellIdentifier);
  await backendSvc.createOption({ name: 'A' });
  await backendSvc.createOption({ name: 'B' });
  await backendSvc.createOption({ name: 'C' });

  const selectOptionCellData = await selectOptionCellController.getCellData().then((result) => result.unwrap());
  if (selectOptionCellData.options.length !== 3) {
    throw Error('The options should equal to 3');
  }

  if (selectOptionCellData.select_options.length !== 3) {
    throw Error('The selected options should equal to 3');
  }
  await selectOptionCellController.dispose();

  // Switch to RichText field type
  await typeOptionController.switchToField(FieldType.RichText).then((result) => result.unwrap());
  if (typeOptionController.fieldType !== FieldType.RichText) {
    throw Error('The field type should be text');
  }

  const textCellController = await makeTextCellController(multiSelectField.field.id, row, databaseController).then(
    (result) => result.unwrap()
  );
  const cellContent = await textCellController.getCellData();
  if (cellContent.unwrap() !== 'A,B,C') {
    throw Error('The cell content should be A,B,C, but receive: ' + cellContent.unwrap());
  }

  await databaseController.dispose();
}

async function testEditField() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());
  const fieldInfos = databaseController.fieldController.fieldInfos;

  // Modify the name of the field
  const firstFieldInfo = fieldInfos[0];
  const controller = new TypeOptionController(view.id, Some(firstFieldInfo));
  await controller.initialize();
  const newName = 'hello world';
  await controller.setFieldName(newName);

  await new Promise((resolve) => setTimeout(resolve, 200));
  await assertFieldName(view.id, firstFieldInfo.field.id, firstFieldInfo.field.field_type, newName);
  await databaseController.dispose();
}

async function testCreateNewField() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());
  await assertNumberOfFields(view.id, 3);

  // Modify the name of the field
  const controller = new TypeOptionController(view.id, None);
  await controller.initialize();
  await assertNumberOfFields(view.id, 4);
  await databaseController.dispose();
}

async function testDeleteField() {
  const view = await createTestDatabaseView(ViewLayoutTypePB.Grid);
  const databaseController = await openTestDatabase(view.id);
  await databaseController.open().then((result) => result.unwrap());

  // Modify the name of the field.
  // The fieldInfos[0] is the primary field by default, we can't delete it.
  // So let choose the second fieldInfo.
  const fieldInfo = databaseController.fieldController.fieldInfos[1];
  const controller = new TypeOptionController(view.id, Some(fieldInfo));
  await controller.initialize();
  await assertNumberOfFields(view.id, 3);
  await controller.deleteField();
  await assertNumberOfFields(view.id, 2);
  await databaseController.dispose();
}

export const TestCreateGrid = () => {
  return TestButton('Test create build-in grid', createBuildInGrid);
};

export const TestEditCell = () => {
  return TestButton('Test editing cell', testEditGridRow);
};

export const TestCreateRow = () => {
  return TestButton('Test create row', testCreateRow);
};
export const TestDeleteRow = () => {
  return TestButton('Test delete row', testDeleteRow);
};
export const TestCreateSelectOptionInCell = () => {
  return TestButton('Test create a select option in cell', testCreateOptionInCell);
};

export const TestGetSingleSelectFieldData = () => {
  return TestButton('Test get single-select column data', testGetSingleSelectFieldData);
};

export const TestSwitchFromSingleSelectToNumber = () => {
  return TestButton('Test switch from single-select to number column', testSwitchFromSingleSelectToNumber);
};

export const TestSwitchFromMultiSelectToText = () => {
  return TestButton('Test switch from multi-select to text column', testSwitchFromMultiSelectToRichText);
};

export const TestEditField = () => {
  return TestButton('Test edit the column name', testEditField);
};

export const TestCreateNewField = () => {
  return TestButton('Test create a new column', testCreateNewField);
};

export const TestDeleteField = () => {
  return TestButton('Test delete a new column', testDeleteField);
};

export const TestButton = (title: string, onClick: () => void) => {
  return (
    <React.Fragment>
      <div>
        <button className='rounded-md bg-blue-400 p-4' type='button' onClick={() => onClick()}>
          {title}
        </button>
      </div>
    </React.Fragment>
  );
};
