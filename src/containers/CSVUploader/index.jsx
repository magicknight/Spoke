import React, { Component } from "react";
import types from "prop-types";
import { RaisedButton } from "material-ui";
import _ from "lodash";
import theme from "src/styles/theme";
import { StyleSheet, css } from "aphrodite";

import parseCSV from "./parseCSV";
import FilePicker from "./FilePicker";
import ValidationStats from "./ValidationStats";
import ColumnName from "./ColumnName";

const styles = StyleSheet.create({
  uploadColumnsWrapper: {
    display: "flex",
    flexDirection: "row"
  },
  uploadColumn: {
    flex: "1"
  },
  errorMessage: {
    backgroundColor: theme.colors.red,
    padding: "10px 5px"
  }
});

export default class CSVUploader extends Component {
  static propTypes = {
    onUpload: types.func.isRequired,
    initialError: types.string,
    maxRows: types.number,
    columnConfig: types.arrayOf(
      types.shape({
        // Name of the CSV column
        inputName: types.string.isRequired,

        // Alternative names for the CSV column
        aliases: types.arrayOf(types.string),

        // What to rename the field to when passing the
        // data to onUpload
        apiName: types.string.isRequired,

        // Whether this column is required
        required: types.bool,

        // A user-facing description of the column
        description: types.string.isRequired,

        // A function that returns true if the data is valid
        // and false otherwise. Receives (value, row) where
        // row is the row AFTER aliases have been applied (so
        // all data will show up under the inputName).
        //
        // If ANY validate() function in the CSV upload fails, the
        // user will be blocked from uploading any rows. If you
        // want to distinguish between blocking errors like this,
        // and non-blocking errors that should just filter
        // out the row, then use transformAndValidate() instead
        // for more control over the validation process.
        validate: types.func,

        // Instead of providing a validate() function, you
        // may instead provide this transformAndValidate
        // function. This function should throw an error if you
        // want to prevent the whole CSV from being uploaded,
        // or return:
        //
        // { valid: Boolean, value: any }
        //
        // If you return valid: false, the row will be filtered out
        // and reported in the count of invalid rows, but the user
        // will still be able to upload the rest of the rows.
        transformAndValidate: types.func
      })
    ),

    // Deduplicate rows. This should be an inputName from the column config.
    dedupeOn: types.string
  };

  constructor(props) {
    super(props);

    this.state = {
      state: "idle", // idle, parsing, parsed, uploading
      errors: this.props.initialError, // Errors from CSV parsing or input -- blocks trying to upload
      uploadError: null, // Errors from upload -- does not block trying to upload again
      parsedData: null,
      validationStats: null,
      fields: null
    };
  }

  onPickCSV = async (acceptedFiles, rejectedFiles) => {
    if (
      rejectedFiles.length > 0 ||
      acceptedFiles.length + rejectedFiles.length > 1
    ) {
      this.setState({ errors: ["Please upload a single CSV file"] });
      return;
    }

    this.setState({
      errors: null,
      parsedData: null,
      validationStats: null,
      fields: null,
      state: "parsing"
    });

    const { data, fields, validationStats, fileName, errors } = await parseCSV(
      acceptedFiles[0],
      {
        maxRows: this.props.maxRows,
        columnConfig: this.props.columnConfig,
        dedupeOn: this.props.dedupeOn
      }
    );

    if (!!errors.length) {
      this.setState({
        state: "parsed",
        validationStats,
        errors,
        fields
      });
    } else {
      this.setState({
        state: "parsed",
        validationStats,
        fields,
        fileName,
        parsedData: data,
        errors: data.length > 0 ? [] : ["Please upload at least one valid row."]
      });
    }
  };

  onDelete = () => {
    this.setState({
      errors: null,
      uploadError: null,
      parsedData: null,
      validationStats: null,
      fields: null,
      state: "idle"
    });
  };

  onSave = async () => {
    this.setState({
      state: "uploading",
      uploadError: null,
      uploadProgress: 0
    });

    try {
      await this.props.onUpload({
        data: this.state.parsedData,
        fileName: this.state.fileName,
        onUploadProgress: progressEvent => {
          if (this.state.state === "uploading") {
            const percentCompleted = Math.round(
              progressEvent.loaded / progressEvent.total
            );

            this.setState({
              uploadProgress: percentCompleted
            });
          }
        }
      });

      this.setState({
        state: "idle",
        errors: null,
        uploadError: null,
        parsedData: null,
        validationStats: null,
        fields: null
      });
    } catch (e) {
      console.error(e);

      this.setState({
        state: "parsed",
        uploadError: e.message
      });
    }
  };

  columnIsPresent(name) {
    if (!this.state.fields) {
      return null;
    }

    return this.state.fields.indexOf(name) !== -1;
  }

  render() {
    const [requiredColumns, optionalColumns] = _.partition(
      this.props.columnConfig,
      "required"
    );

    const canSaveAndContinue =
      !(this.state.errors && this.state.errors.length) &&
      this.state.state !== "uploading" &&
      _.every(requiredColumns, c => this.columnIsPresent(c.inputName));

    const validationErrors = this.state.errors && this.state.errors.slice(0, 9);

    const errors = this.state.uploadError
      ? [this.state.uploadError]
      : validationErrors;

    const allErrorLength = this.state.errors && this.state.errors.length;
    const visibleErrors = validationErrors && validationErrors.length;
    const rest = allErrorLength - visibleErrors;

    return (
      <>
        <h2>Upload CSV</h2>
        <p>Upload a CSV. The first row should be column headings.</p>
        {errors && !!errors.length
          ? errors.map(err => (
              <div className={css(styles.errorMessage)}>{err}</div>
            ))
          : null}
        {rest ? (
          <div style={{ marginTop: 10, fontWeight: "bold" }}>
            ...and {rest} more rows with errors
          </div>
        ) : null}

        <div className={css(styles.uploadColumnsWrapper)}>
          <div className={css(styles.uploadColumn)}>
            <h3>Required Columns</h3>
            <div>
              {requiredColumns.map(c => (
                <ColumnName
                  key={c.inputName}
                  name={c.inputName}
                  desc={c.description}
                  type={c.required ? "required" : "optional"}
                  present={this.columnIsPresent(c.inputName)}
                />
              ))}
            </div>
            <h3 style={{ paddingTop: "20px" }}>Optional Columns</h3>
            <div>
              {optionalColumns.map(c => (
                <ColumnName
                  key={c.inputName}
                  name={c.inputName}
                  desc={c.description}
                  type={c.required ? "required" : "optional"}
                  present={this.columnIsPresent(c.inputName)}
                />
              ))}
            </div>
          </div>

          {this.state.state === "idle" && (
            <FilePicker onPick={this.onPickCSV} />
          )}

          {(this.state.state === "parsed" ||
            this.state.state === "uploading") && (
            <ValidationStats
              stats={this.state.validationStats}
              canDelete={this.state.state === "parsed"}
              onDelete={this.onDelete}
            />
          )}
        </div>

        {(this.state.state === "uploading" ||
          this.state.state === "parsed") && (
          <div>
            <RaisedButton
              primary
              label="Upload"
              disabled={!canSaveAndContinue}
              onClick={() => canSaveAndContinue && this.onSave()}
            />
            <span style={{ marginLeft: "10px" }}>
              {this.state.state === "uploading"
                ? `Uploading: ${(this.state.uploadProgress * 100).toFixed(1)}%`
                : ""}
            </span>
          </div>
        )}
      </>
    );
  }
}
