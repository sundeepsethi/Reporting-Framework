/*global location */
jQuery.sap.require("metro.gwf.reporting.util.dynamicControl");
sap.ui.define([
	"metro/gwf/reporting/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"metro/gwf/reporting/model/formatter",
	'sap/ui/core/util/Export',
	'sap/ui/core/util/ExportTypeCSV',
	'sap/m/MessageToast',
	"../util/ToggleFullScreenHandler"
], function(BaseController, JSONModel, formatter, Export, ExportTypeCSV, MessageToast,ToggleFullScreenHandler) {
	"use strict";
	var that;
	return BaseController.extend("metro.gwf.reporting.controller.Detail", {

		formatter: formatter,
		sortingPopUpTable: null,
		oDetailTableFilter:null,
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function() {
			that = this;
			
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				title: this.getResourceBundle().getText("reportTitle"),
				lineItemListTitle: this.getResourceBundle().getText("detailLineItemTableHeading"),
				tableVisible: true,
				graphVisible: true,
				busyFilterTable: false,
				exportButtonVisible:true
			});

			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			this.setModel(oViewModel, "detailView");

			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));

			// create dialog via fragment factory
			this.oDialog = sap.ui.xmlfragment(this.getView().getId(), "metro.gwf.reporting.fragments.SelectionDialog", this);
			// connect dialog to view (models, lifecycle)
			this.getView().addDependent(this.oDialog);
			this.oDialog.addStyleClass("sapUiSizeCompact");
			
			//Maintianing Different Types of graph in chartContainer
			var chartTypeData = [{key:"column",name:that.getResourceBundle().getText("column")},
			{key:"stacked_bar",name:that.getResourceBundle().getText("stackedBar")},
			{key:"line",name:that.getResourceBundle().getText("line")}];
			var chartTypeModel = new sap.ui.model.json.JSONModel(chartTypeData);
			that.getView().byId("chartTypeSelector").setModel(chartTypeModel,"chartTypeModel");
		},
		_constants: {
			vizFrame: {
				id: "chartContainerVizFrame",
				dataset: {
					dimensions: [{
						name: "Dimension",
						value: "{dimension}"
					}],
					measures: [{
						name: "Measure",
						value: "{measure}"
					}],
					data: {
						path: "/"
					}
				},
				type: "column", //stacked_bar
				properties: {
					plotArea: {
						dataLabel: {
							visible: true
						}
					},
					title: {
						visible: false
					},
					valueAxis: {
						title: {
							visible: false
						}
					}
				},
				feedItems: [{
						uid: "valueAxis",
						type: "Measure",
						values: ["Measure"]
					}, {
						uid: "categoryAxis",
						type: "Dimension",
						values: ["Dimension"]
					}
				]
			}
		},
		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function(oEvent) {
			var sObjectId = oEvent.getParameter("arguments").objectId;
			this.getModel().metadataLoaded().then(function() {
				var sObjectPath = this.getModel().createKey("ReportSet", {
					ReportKeyword: sObjectId
				});
				this._bindView("/" + sObjectPath);

				//when object matches then detail view and selection screen will be created
				that.getView().byId("oTokenizer").removeAllContent();
				if (this.getModel().getProperty("/" + sObjectPath)) {
					var data = this.getModel().getProperty("/" + sObjectPath);
					metro.gwf.reporting.util.UIHelper.setReportMasterData(data);
					that.createDetailScreenTable();
					that.createDetailScreenGraph();
					that.getDimensionAndMeasuerConfig();
					var p = $.when(that.getVariant());
					p.done(function(o) {
						that.modifyVarientData();
						that.displayDetailScreenTable();
						that.buildSelectionScreen();
					});
					p.fail(function(e) {
						jQuery.sap.log.getLogger().error("Data fetch failed" + e.toString());
					});
				}
			}.bind(this));
		},

		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath is path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function(sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("detailView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function() {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function() {
						oViewModel.setProperty("/busy", false);
						var customData = this.getModel().getProperty(sObjectPath);
						metro.gwf.reporting.util.UIHelper.setReportMasterData(customData);
						that.createDetailScreenTable();
						that.createDetailScreenGraph();
						that.getDimensionAndMeasuerConfig();
						var p = $.when(that.getVariant());
						p.done(function(o) {
							that.modifyVarientData();
							that.displayDetailScreenTable();
							that.buildSelectionScreen();
						});
						p.fail(function(e) {
							jQuery.sap.log.getLogger().error("Data fetch failed" + e.toString());
						});
					}
				}
			});
		},
		/**
		 * function is getting called when binding is getting changed.
		 * On binding change all existing selection screen elements would be destroyed and 
		 * would be recreated in _bindView method.
		 * @function
		 * @private
		 */
		_onBindingChange: function() {
			//destroy selection screen
			if (this.oDialog.getContent()[0]) {
				sap.ui.getCore().byId(this.oDialog.getContent()[0].getId()).destroy();
			}
			that.oDetailTableFilter=null;
			that.getModel("detailView").setProperty("/exportButtonVisible",true);
			that.getView().byId("chartTypeSelector").setSelectedKey(that._constants.vizFrame.type);
			
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}

			var sPath = oElementBinding.getPath();
			this.getOwnerComponent().oListSelector.selectAListItem(sPath);
		},
		/**
		 * Making detail view busy until metadata is not loaded.
		 * @function
		 * @private
		 */
		_onMetadataLoaded: function() {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oDetailTable = that.byId("detailTable"),
				iOriginalLineItemTableBusyDelay = oDetailTable.getBusyIndicatorDelay();

			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);

			oDetailTable.attachEvent("updateFinished", function() {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/busyTable", false);
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});

			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			oViewModel.setProperty("/busyTable", true);
			oViewModel.setProperty("/exportBtnEnable", false);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},
		onToggleFullScreen: function (oEvt) {
			ToggleFullScreenHandler.updateMode(oEvt, this);
		},
		/**
		 * Create detail Screen table and create bidning also.
		 * @function
		 * @private
		 */
		createDetailScreenTable: function() {
			var columns = [];
			var rows = [];
			var model = new sap.ui.model.json.JSONModel();
			model.setData({
				columns: columns,
				rows: rows
			});

			var oDetailTable = that.byId("detailTable");
			var headerToolBar = new sap.m.Toolbar({
				content: [
					new sap.m.Title({
						text: ""
					}),
					new sap.m.ToolbarSpacer(),
					new sap.m.Button({
						tooltip: that.getResourceBundle().getText("setting"),
						icon: "sap-icon://action-settings",
						press: function() {
							if (!that._oPersDetailTableDialog) {
								that._oPersDetailTableDialog = sap.ui.xmlfragment(that.getView().getId(),
									"metro.gwf.reporting.fragments.TablePersonalizationDialog", that);
								that.getView().addDependent(that._oPersDetailTableDialog);
							}
							that._oPersDetailTableDialog.setModel(that.getModel("persDetailTableModel"),"persDetailTableModel");
							var tableData = that._oPersDetailTableDialog.getModel("persDetailTableModel").getData();
							for (var k in tableData) {
								if (tableData[k].columnVisible === true) {
									that._oPersDetailTableDialog.getItems()[k].setSelected(true);
								}
							}
							that._oPersDetailTableDialog.open();
						}
					}),
					new sap.m.Button({
						tooltip: that.getResourceBundle().getText("sortBy"),
						icon: "sap-icon://drop-down-list",
						press: function() {
							if (!that._oDetailSortingDialog) {
								that._oDetailSortingDialog = sap.ui.xmlfragment(that.getView().getId(), "metro.gwf.reporting.fragments.SortingDialog",
									that);
								that.getView().addDependent(that._oDetailSortingDialog);
							}
							that._oDetailSortingDialog.setModel(that.getModel("persDetailTableModel"),"sortDialogModel");
							that._oDetailSortingDialog.open();
							that.sortingPopUpTable = oDetailTable;
						}
					}),
					new sap.m.SearchField({
						placeholder: that.getResourceBundle().getText("search"),
						liveChange: function(oEvent) {
							var sQuery = oEvent.getParameter("newValue");
							var oFilter = null;
							var tableRowCells = oDetailTable.getModel("detailTableModel").getProperty("/rows");
							var tableColumns = oDetailTable.getModel("detailTableModel").getProperty("/columns");
							var visibleColumns = [];
							$(Object.keys(tableColumns)).each(function(index, element) {
								if (tableColumns[index].columnVisible === true)
									visibleColumns.push(index);
							});
							var filterArr = [];
							if (sQuery) {
								$(Object.keys(tableRowCells[0])).each(function(index, element) {
									for (var k in visibleColumns) {
										if (visibleColumns[k] === index) {
											filterArr.push(new sap.ui.model.Filter(element, sap.ui.model.FilterOperator.Contains, sQuery));
										}
									}
								});
								oFilter = new sap.ui.model.Filter(filterArr, false);
							}
							that.oDetailTableFilter = oFilter;
							oDetailTable.getBinding("items").filter(that.oDetailTableFilter, "Application");
							if(oDetailTable.getAggregation("items")){
								var tableLength = null;
								if(that.oDetailTableFilter != null){
								tableLength = oDetailTable.getAggregation("items").length;
								}else{
								tableLength = oDetailTable.getModel("detailTableModel").getProperty("/rows").length;
								}
								oDetailTable.getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[tableLength]));
							}else{
								oDetailTable.getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[0]));
							}
							
						},
						width: "{= ${device>/system/phone}?'5rem':'9rem' }"//"9rem"
					}).addStyleClass("searchFieldWidth").attachBrowserEvent("focusin",function(oEvent){
						if(that.getModel("device").getProperty("/system/phone"))
						this.setWidth('9rem');
					}).attachBrowserEvent("focusout",function(oEvent){
						if(that.getModel("device").getProperty("/system/phone"))
						this.setWidth('5rem');
					})
				]
			});
			oDetailTable.setHeaderToolbar(headerToolBar);
			oDetailTable.addStyleClass(
				"customTableBorder compVHMainTable sapUiTable sapUiTableCHdr sapUiTableEdt sapUiTableM sapUiTableRSel sapUiTableSelModeMultiToggle sapUiTableVScr"
			);
			oDetailTable.bindAggregation("columns", "detailTableModel>/columns", function(index, context) {
				return new sap.m.Column({
					header: new sap.m.Label({
						text: '{detailTableModel>columnName}',
						design: sap.m.LabelDesign.Bold,
						tooltip: '{detailTableModel>columnName}'
					}),
					// mergeDuplicates:true,
					visible: '{detailTableModel>columnVisible}'
				});
			});
			oDetailTable.bindItems("detailTableModel>/rows", function(index, context) {
				var obj = context.getObject();
				var row = new sap.m.ColumnListItem();
				for (var k in obj) {
					row.addCell(new sap.m.Text({
						text: obj[k],
						tooltip: obj[k]
					}));
				}
				return row;
			});
			oDetailTable.setModel(model,"detailTableModel");
		},
		/**
		 * Get the column dynamically from service and bind them to detail screen table.
		 * @function
		 * @private
		 */
		displayDetailScreenTable: function() {
			that.getModel("detailView").setProperty("/busyTable", true);
			that.getModel("detailView").setProperty("/lineItemTableDelay", 0);
			that.getModel("detailView").setProperty("/exportBtnEnable", false);
			//binding columns data in detail page table
			var o = function(d, r) {
				var tableColumn = [];
				var data = d.results;
				data = data.sort(function(a, b) {
					return (a.ColPosition > b.ColPosition) ? 1 : ((b.ColPosition > a.ColPosition) ? -1 : 0);
				});
				for (var k in data) {
					var obj = {};
					obj.columnName = data[k].ColLable;
					obj.columnVisible = data[k].Visible;
					obj.minScreenWidth = "Tablet";
					obj.demandPopIn = "true";
					tableColumn.push(obj);
				}
				that.byId("detailTable").getModel("detailTableModel").setProperty("/columns", tableColumn);
				that.byId("detailTable").getModel("detailTableModel").refresh(true);

				var sortModel = new sap.ui.model.json.JSONModel();
				sortModel.setData(tableColumn);
				that.setModel(sortModel, "persDetailTableModel");
			};
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var varientData = metro.gwf.reporting.util.UIHelper.getVarientData();
			var oFilter = "$filter=ReportKeyword eq '" + reportKeyword + "' and Filters eq '" + varientData +
				"' and FlagIndicator eq 'REPTABLE'";
			oFilter = encodeURI(oFilter);
			//call service to get Columns
			that.getModel().read("/ColumnSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(o, this)
			});
			
			that.fillDetailTableRows(oFilter);
			
		},
		
		/**
		 * Create Detail Screen graph with no data.
		 * @function
		 * @private
		 */
		createDetailScreenGraph: function() {
			var vizFrame = that.getView().byId(that._constants.vizFrame.id);
			var oVizFrame = that._constants.vizFrame;
			var graphData = [];
			var oModel = new sap.ui.model.json.JSONModel(graphData);
			vizFrame.setVizProperties(oVizFrame.properties);
			var oDataset = new sap.viz.ui5.data.FlattenedDataset(oVizFrame.dataset);

			vizFrame.setDataset(oDataset);
			vizFrame.setModel(oModel);
			that._addFeedItems(vizFrame, oVizFrame.feedItems);
			vizFrame.setVizType(oVizFrame.type);
		},
		
		/**
		 * Get Dimension and measures from configuration table and set it to globally.
		 * @function
		 * @private
		 */
		getDimensionAndMeasuerConfig: function() {
			//getting properties for detail page graph
			var o = function(d, r) {
				metro.gwf.reporting.util.UIHelper.setDimensionAndMeasures(d.results);
			};
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var oFilter = "$filter=ReportKeyword eq '" + reportKeyword + "'";
			oFilter = encodeURI(oFilter);
			that.getModel().read("/ChartDimensionNMeasureSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(o, this)
			});
		},
		
		/**
		 * Get variants from Config table and based on variants, selection screen is pre filled.
		 * @function
		 * @private
		 */
		getVariant: function(evt) {
			var c = $.Deferred();
			var o = function(d, r) {
				metro.gwf.reporting.util.UIHelper.setVarientData(d.results[0].FilterString);
				c.resolve(d.results[0].FilterString);
			};
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var entityFilter = "$filter=ReportKeyword eq '" + reportKeyword + "'";
			entityFilter = encodeURI(entityFilter);
			that.getModel().read("/VariantSet", {
				urlParameters: [entityFilter],
				success: jQuery.proxy(o, this)
			});
			return c.promise();
		},
		
		/**
		 * Build selection screen pop up based on selection screen configuration table.
		 * @function
		 * @private
		 */
		buildSelectionScreen: function() {
			var o = function(d, r) {
				metro.gwf.reporting.util.UIHelper.setSelectionData(d.results); //comment till using local data
				var selectionData = metro.gwf.reporting.util.UIHelper.getSelectionData();
				var dyGrid = metro.gwf.reporting.util.dynamicControl.createDynContent(selectionData);
				
				var vbox = new sap.m.VBox({
					items: [dyGrid]
				});
				that.FilterVBox = vbox;
				this.oDialog.addContent(vbox);

				//Wait till filter table is created. once it is created then call service to get data for filter table
				that._oWhenFilterTableHasBeenSet = new Promise(function(_fnResolveFilterTableHasBeenSet) {
					that._fnResolveFilterTableHasBeenSet = _fnResolveFilterTableHasBeenSet;
				}.bind(that));

				that._oWhenFilterTableHasBeenSet
					.then(function(oFilterTable) {
						that.autoSetDataForFilterTable(oFilterTable);
					});
				//handling dropdown filters behaviour through below function
				that.handleDropdown();
				that.setSelectionFilterValues();
				that.buildTokens();
				//Once all filters is created using dynContent function
				//then only create filer table, not before that
				var filterTableVisibile = metro.gwf.reporting.util.UIHelper.getReportMasterData().SeltableActive;
				if(filterTableVisibile === 'X'){
					that.createPopUpFilterTable();
					that.oDialog.setContentHeight('60%');
					that.oDialog.setContentWidth('60%');
				}
				else{
					that.oDialog.setContentHeight('auto');
					that.oDialog.setContentWidth('auto');
				}

			};
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var oFilter = "$filter=ReportKeyword eq '" + reportKeyword + "'";
			oFilter = encodeURI(oFilter);
			that.getModel().setHeaders({
				"X-Requested-With": "XMLHttpRequest",
				"Content-Type": "application/atom+xml"
			});
			that.getModel().read("/SelectionScreenSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(o, this)
			});
		},
		
		/**
		 * Create pop up filter table once all filters are getting created using dynamicControl File.
		 * @function
		 * @private
		 */
		createPopUpFilterTable: function() {
			var columns = [];
			var rows = [];
			var model = new sap.ui.model.json.JSONModel();
			model.setData({
				columns: columns,
				rows: rows
			});
			var infoToolBar = new sap.m.Toolbar({
				content: [new sap.m.Text({
					text: that.getResourceBundle().getText("itemSelected",[0])
				})]
			});
			var table = new sap.m.Table("filterTable", {
				mode: sap.m.ListMode.MultiSelect,
				width: "auto",
				busy: "{detailView>/busyFilterTable}",
				selectionChange: function(evt) {
					var selectedRowsNo = table.getSelectedContexts().length;
					infoToolBar.getContent()[0].setText(that.getResourceBundle().getText("itemSelected",[selectedRowsNo]));
				}
			});
			var headerToolBar = new sap.m.Toolbar({
				content: [
					new sap.m.Title({
						text: ""
					}),
					new sap.m.ToolbarSpacer(),
					new sap.m.Button({
						tooltip: that.getResourceBundle().getText("sortBy"),
						icon: "sap-icon://drop-down-list",
						visible: "{= !${device>/system/phone} }",
						press: function() {
							if (!that._oDialog) {
								that._oDialog = sap.ui.xmlfragment(that.getView().getId(), "metro.gwf.reporting.fragments.SortingDialog", that);
								that.getView().addDependent(that._oDialog);
							}
							that._oDialog.setModel(that.getModel("sortModel"),"sortDialogModel");
							that._oDialog.open();
							that.sortingPopUpTable = table;
						}
					}),
					new sap.m.SearchField({
						placeholder: that.getResourceBundle().getText("search"),
						// visible:false,
						liveChange: function(oEvent) {
							var sQuery = oEvent.getParameter("newValue");
							var oFilter = null;
							var tableRowCells = table.getModel().getProperty("/rows");
							var filterArr = [];
							if (sQuery) {
								$(Object.keys(tableRowCells[0])).each(function(index, element) {
									filterArr.push(new sap.ui.model.Filter(element, sap.ui.model.FilterOperator.Contains, sQuery));
								});
								oFilter = new sap.ui.model.Filter(filterArr, false);
							}
							table.getBinding("items").filter(oFilter, "Application");
							// table.getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[table.getAggregation("items").length]));
						},
						width: "{= ${device>/system/phone}?'7rem':'9rem' }"//
					}).addStyleClass("searchFieldWidth").attachBrowserEvent("focusin",function(oEvent){
						if(that.getModel("device").getProperty("/system/phone"))
						this.setWidth('9rem');
					}).attachBrowserEvent("focusout",function(oEvent){
						if(that.getModel("device").getProperty("/system/phone"))
						this.setWidth('7rem');
					})
					
					/*new sap.m.Button({
						icon:"sap-icon://search",
						visible:"{= ${device>/system/phone}}",
						press:function(oEvent){
							oEvent.getSource().setVisible(false);
							oEvent.getSource().getParent().getContent()[3].setVisible(true);
						}
					})*/
				]
			});
			table.setHeaderToolbar(headerToolBar);
			table.setInfoToolbar(infoToolBar);
			table.addStyleClass(
				"customSelectionTableBorder sapUiResponsiveMargin compVHMainTable sapUiTable sapUiTableCHdr sapUiTableEdt sapUiTableM sapUiTableRSel sapUiTableSelModeMultiToggle sapUiTableVScr"
			);
			table.bindAggregation("columns", "/columns", function(index, context) {
				return new sap.m.Column({
					header: new sap.m.Label({
						text: '{columnName}',
						tooltip: '{columnName}'
					})
				});
			});
			table.bindItems("/rows", function(index, context) {
				var obj = context.getObject();
				var row = new sap.m.ColumnListItem();
				for (var k in obj) {
					row.addCell(new sap.m.Text({
						text: obj[k],
						tooltip: obj[k]
					}));
				}
				return row;
			});
			table.setModel(model);
			sap.ui.getCore().byId(this.oDialog.getContent()[0].getId()).addItem(table);
			that._fnResolveFilterTableHasBeenSet(table);
		},
		/**
		 * Once Filter Table is created then load data for filter table using another service.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		autoSetDataForFilterTable: function(filterTable) {
			// that.setSelectionFilterValues();
			// that.buildTokens();
			that.getModel("detailView").setProperty("/busyFilterTable", true);
			//binding columns data in filter table
			var o = function(d, r) {
				var tableColumn = []; 
				var data = d.results;
				for (var k in data) {
					var obj = {};
					obj.columnName = data[k].ColLable;
					tableColumn.push(obj);
				}
				filterTable.getModel().setProperty("/columns", tableColumn);
				filterTable.getModel().refresh(true);
				var sortModel = new sap.ui.model.json.JSONModel();
				sortModel.setData(tableColumn);
				that.setModel(sortModel, "sortModel");
			};
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var varientData = metro.gwf.reporting.util.UIHelper.getVarientData();
			var oFilter = "$filter=ReportKeyword eq '" + reportKeyword + "' and Filters eq '" + varientData +
				"' and FlagIndicator eq 'SELTABLE'";
			oFilter = encodeURI(oFilter);
			that.getModel().read("/ColumnSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(o, this)
			});

			// //binding rows data in filter table
			var f = function(d, r) {
				var tableColumn = [];
				var data = d.results;
				for (var k in data) {
					var obj = {};
					$(Object.keys(data[k])).each(function(index, element) {
						if (element.indexOf("col") !== -1) {
							obj[element] = data[k][element];
						} else if (element.indexOf("Indicator") !== -1) {
							obj[element] = data[k][element];
						}
					});
					tableColumn.push(obj);
				}
				filterTable.getModel().setProperty("/rows", tableColumn);
				filterTable.getModel().refresh(true);
				filterTable.selectAll();
				that.getModel("detailView").setProperty("/busyFilterTable", false);
				filterTable.getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[tableColumn.length]));
				filterTable.getInfoToolbar().getContent()[0].setText(that.getResourceBundle().getText("itemSelected",[tableColumn.length]));
			};
			that.getModel().read("/ReportTableSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(f, this)
			});
		},
		
		/**
		 * Modify Varient Data which we got from Configuration Table of variants in gateway.
		 * It will create date based on date dropdown like based on currentYear 
		 * it will add varient as 01-01-2017^31-12-2017
		 * @function
		 * @private
		 */
		modifyVarientData: function() {
			var resultArray = [];
			var varientData = metro.gwf.reporting.util.UIHelper.getVarientData();
			if (varientData)
				resultArray = varientData.split("|");

			//code applicable when we need to show Date Dropdown with custom entires like Today, Current Year etc.
			for (var index = 0; index < resultArray.length; index++) {
				var filterValueArr = resultArray[index].split("~");
				var filterValueType = filterValueArr[0];
				var filterValue = filterValueArr[1];
				if (filterValueType == "DATEDD") {
					var dateObj = that.getDateValueAndVisibility(filterValue);
					var varientData = varientData + "|DATE~" + (formatter.formatDaysAgo(dateObj.startDate)) + "^" + (formatter.formatDaysAgo(dateObj.endDate));
					metro.gwf.reporting.util.UIHelper.setVarientData(varientData);
				}
			}
			//end of code applicable when we need to show Date Dropdown with custom entires like Today, Current Year etc.

		},
		
		/**
		 * Fill detail screen table by calling one odata service.
		 * @function
		 * @param oFilter : oFilter contains url parameter for the service
		 * @private
		 */
		fillDetailTableRows:function(oFilter){
			// //binding rows data in selection table
			var f = function(d, r) {
				var tableColumn = [];
				var data = d.results;
				for (var k in data) {
					var obj = {};
					$(Object.keys(data[k])).each(function(index, element) {
						if (element.indexOf("col") !== -1) {
							obj[element] = data[k][element];
						}
					});
					tableColumn.push(obj);
				}
				that.byId("detailTable").getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[tableColumn.length]));
				// that.byId("detailTable").getModel().setSizeLimit(tableColumn.length);
				that.byId("detailTable").getModel("detailTableModel").setProperty("/rows", tableColumn);
				that.byId("detailTable").getModel("detailTableModel").refresh(true);
				if(!data.length){
					that.getModel("detailView").setProperty("/exportBtnEnable", false);
				}else{
					that.getModel("detailView").setProperty("/exportBtnEnable", true);
				}
				// that.getModel("detailView").setProperty("/busyTable", false);
				that.createDimensionAndMeasures();
			};
			that.getModel().read("/ReportTableSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(f, this)
			});
		},
		
		/**
		 * Handling date visibility and enability based on date dropdown
		 * Its like when we select Current Year then in date field start date will be 01-01-2017
		 * and End Date will be 21-12-2017 and both will be disabled.
		 * But in case of Key Date only single date will be visible and allowed to choose free date.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		getDateValueAndVisibility: function(value) {
			var dateObj = {};

			if (value === "today") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = false;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "currentYear") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getCurrentYearInitialDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getCurrentYearEndDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "currentMonth") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getCurrentMonthInitialDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getCurrentMonthEndDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "all") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getInitialDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getEndDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "pastUntilToday") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getInitialDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "futureFromToday") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getEndDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = false;
				dateObj.endDateEnable = false;
			} else if (value === "keyDate") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.endDate = '';//dateObj.startDate;//metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = false;
				dateObj.startDateEnable = true;
				dateObj.endDateEnable = false;
			} else if (value === "otherPeriod") {
				dateObj.startDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.endDate = metro.gwf.reporting.util.UIHelper.getTodayDate();
				dateObj.startDateVisible = true;
				dateObj.endDateVisible = true;
				dateObj.startDateEnable = true;
				dateObj.endDateEnable = true;
			}
			return dateObj;
		},
		
		/**
		 * Based on Varient data which we have in detail screen, selection pop up would be pre filled according to those variants.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		setSelectionFilterValues: function() {
			var resultArray = [];
			var varientData = metro.gwf.reporting.util.UIHelper.getVarientData();
			if (varientData)
				resultArray = varientData.split("|");

			for (var index = 0; index < resultArray.length; index++) {
				var filterValueArr = resultArray[index].split("~");
				var filterValueType = filterValueArr[0];
				var filterValue = filterValueArr[1];
				var dyResultReport = metro.gwf.reporting.util.UIHelper.getSelectionData();
				for (var j = 0; j < dyResultReport.length; j++) {

					if (dyResultReport[j].FieldType == "PARAMETER" && filterValueType === dyResultReport[j].FilterKeyword) {
						if (dyResultReport[j].ElementType == "INPUT" && dyResultReport[j].Visible == "X") {
							if (dyResultReport[j].ValueType == "DATE") {
								sap.ui.getCore().byId(dyResultReport[index].ElementId).setValue(filterValue);
							} else if (dyResultReport[j].ValueType == "COMBO") {
								sap.ui.getCore().byId(dyResultReport[j].ElementId).setSelectedKey(filterValue);
								if(filterValueType === 'DATEDD'){
								var dateObj = that.getDateValueAndVisibility(filterValue);
								// console.log(dateObj);
								sap.ui.getCore().byId(dyResultReport[j+1].ElementId).setEnabled(dateObj.startDateEnable);
								sap.ui.getCore().byId(dyResultReport[j+2].ElementId).setEnabled(dateObj.endDateEnable);
								sap.ui.getCore().byId(dyResultReport[j+1].ElementId).setVisible(dateObj.startDateVisible);
								sap.ui.getCore().byId(dyResultReport[j+2].ElementId).setVisible(dateObj.endDateVisible);
								}
							} else {
								sap.ui.getCore().byId(dyResultReport[j].ElementId).setValue(filterValue);
							}
						}
					} else if (dyResultReport[j].FieldType == "RANGE" && filterValueType === dyResultReport[j].FilterKeyword && dyResultReport[j].Visible ==
						"X") {
						if (dyResultReport[j].ValueType == "DATE") {
							var dateArray = filterValue.split("^");
							sap.ui.getCore().byId(dyResultReport[j].ElementId).setValue(dateArray[0]);
							sap.ui.getCore().byId(dyResultReport[++j].ElementId).setValue(dateArray[1]);
						}
					}

				}
			}
		},
		
		/**
		 * This function is used to return selected filtes in pre designed format.
		 * Its like, when we have Current Year in Date dropdown and Direct Reportees in Selection dropwdown
		 * then it will return as 'DATEDD~currentYear|DATE~01-01-2017^31-12-2017|ORGVIEW~MSS_RPT_SEL_PA'
		 * @function
		 * @private
		 */
		getFilterSelections: function() {
			var resultReport = null;
			var defFilterColumn = "";
			var reportKeyword = metro.gwf.reporting.util.UIHelper.getReportMasterData().ReportKeyword;
			var oFilterColumn = "$filter=ReportKeyword eq '" + reportKeyword + "'";

			oFilterColumn = oFilterColumn + " and Filters eq '";
			var dyResultReport = metro.gwf.reporting.util.UIHelper.getSelectionData();
			for (var index = 0; index < dyResultReport.length; index++) {
				if (dyResultReport[index].FieldType == "PARAMETER") {
					if (dyResultReport[index].ElementType == "INPUT" && dyResultReport[index].Visible == "X") {
						if (dyResultReport[index].ValueType == "DATE") {
							var str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getDateValue();
							if (str === null || str === "") {
								str = "";
							} else {
								str=formatter.formatDaysAgo(str);
							}
							defFilterColumn = defFilterColumn + dyResultReport[index].FilterKeyword + "~" + str + "|";
						} else if (dyResultReport[index].ValueType == "COMBO") {
							defFilterColumn = defFilterColumn + dyResultReport[index].FilterKeyword + "~" + sap.ui.getCore().byId(dyResultReport[index].ElementId)
								.getSelectedKey() + "|";
						} else {
							defFilterColumn = defFilterColumn + dyResultReport[index].FilterKeyword + "~" + sap.ui.getCore().byId(dyResultReport[index].ElementId)
								.getValue() + "|";
						}
					}
				} else if (dyResultReport[index].FieldType == "RANGE" && dyResultReport[index].Visible == "X") {
					if (dyResultReport[index].ValueType == "DATE") {
						if (defFilterColumn.indexOf(dyResultReport[index].FilterKeyword + "~") === -1) {
							var str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getDateValue();
							if (str === null || str === "") {
								defFilterColumn = defFilterColumn + dyResultReport[index].FilterKeyword + "~";
							} else {
								str = formatter.formatDaysAgo(str);
								defFilterColumn = defFilterColumn + dyResultReport[index].FilterKeyword + "~" + str;
							}
						} else {
							var str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getDateValue();
							if (str === null || str === "") {
								defFilterColumn = defFilterColumn + "^" + "|";
							} else {
								str = formatter.formatDaysAgo(str);
								defFilterColumn = defFilterColumn + "^" + str + "|";
							}
						}

					}
				}
			}
			defFilterColumn = defFilterColumn.substring(0, defFilterColumn.length - 1);
			oFilterColumn = oFilterColumn + defFilterColumn + "'";
			return oFilterColumn;
		},
		
		/**
		 * Dependent Function of 'buildTokens' function.
		 * It is used to convert Token's key to Text like initially 
		 * when token are created, those are based on Key field which we got from Variant Set
		 * But later we are replacing key to text.
		 * @function
		 * @private
		 */
		setTokenValue: function(dyResultReport, index, str, tokenizer) {
			if (str === null || str === "") {
				str = "";
			} else {
				var valueElementPosition = dyResultReport[index].ElementPosition;
				for (var k in dyResultReport) {
					if ((dyResultReport[k].ElementInnerPosition === 1) && (valueElementPosition === dyResultReport[k].ElementPosition)) {
						var key = dyResultReport[k].Text;
						var data = [{
							key: str
						}];
						tokenizer.addContent(new sap.m.Button({
							customData: data,
							text: (key + " = " + str)
						}));
						break;
					}
				}
			}
		},
		
		/**
		 * Functio used to build tokens based on variant set.
		 * @function
		 * @private
		 */
		buildTokens: function() {
			var tokenizer = that.getView().byId("oTokenizer");

			var dyResultReport = metro.gwf.reporting.util.UIHelper.getSelectionData();
			for (var index = 0; index < dyResultReport.length; index++) {
				if (dyResultReport[index].FieldType === "PARAMETER") {
					if (dyResultReport[index].ElementType === "INPUT" && dyResultReport[index].Visible === "X") {

						if (dyResultReport[index].ValueType === "DATE") {
							var str = formatter.formatDaysAgo(sap.ui.getCore().byId(dyResultReport[index].ElementId).getDateValue());
							that.setTokenValue(dyResultReport, index, str, tokenizer);
								continue;
						} else if (dyResultReport[index].ValueType === "COMBO") {
							var str = '';
							if (sap.ui.getCore().byId(dyResultReport[index].ElementId).getSelectedItem() !== null) {
								str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getSelectedItem().getText();
								that.setTokenValue(dyResultReport, index, str, tokenizer);
									continue;
							} else {
								sap.ui.getCore().byId(dyResultReport[index].ElementId).getBinding("items").attachChange(function(data) {
									var filterDropDownData = data.getSource().getModel().getData();
									var tokens = tokenizer.getContent();
									for (var k in tokens) {
										var tokenKey = tokens[k].getCustomData()[0].getKey();
										for (var j in filterDropDownData) {
											if (tokenKey == filterDropDownData[j].Key) {
												var txt = tokens[k].getText().replace(tokenKey, filterDropDownData[j].Value);
												tokens[k].setText(txt);
												break;
											}
										}
									}
								});
								var str = '';
								str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getSelectedKey();
								that.setTokenValue(dyResultReport, index, str, tokenizer);
									continue;

							}
						} else {
							var str = sap.ui.getCore().byId(dyResultReport[index].ElementId).getValue();
							that.setTokenValue(dyResultReport, index, str, tokenizer);
								continue;
						}
					}
				} else if (dyResultReport[index].FieldType == "RANGE" && dyResultReport[index].Visible == "X") {
					if (dyResultReport[index].ValueType == "DATE") {
						//nothing should happen, as we are not showing date in detail screen, we are showing Current Year 
						//instead of 01-01-2017 to 31-12-2017, so no need to create token for Date
					}
				}
			}
		},
		
		/**
		 * It is used to handle dropdown filtes behaviour like for date dropdown which function needs to be called.
		 * @function
		 * @private
		 */
		handleDropdown: function() {
			var dyResultReport = metro.gwf.reporting.util.UIHelper.getSelectionData();
			dyResultReport.forEach(function(element, index) {
				if (element.FilterKeyword === "DATEDD") {
					sap.ui.getCore().byId(element.ElementId).attachEvent("change",
						function(evt) {
							that._onPeriodDropDownChange(evt, element);
						}
					);
				}else if (element.FilterKeyword === "ORGVIEW") {
					sap.ui.getCore().byId(element.ElementId).attachEvent("change",
						function(evt) {
							that._onSelectionDropDownChange(evt, element);
						}
					);
				}
			});
		},
		
		/**
		 * It is used to maintain functionality for Date Dropdown.
		 * @function
		 * @private
		 */
		_onPeriodDropDownChange: function(evt, element) {
			var elementPosition = element.ElementPosition;
			var dyResultReport = metro.gwf.reporting.util.UIHelper.getSelectionData();
			var dateArr = [];
			dyResultReport.forEach(function(item, index) {
				if (item.ElementPosition === elementPosition && item.ValueType === "DATE") {
					dateArr.push(item);
				}
			});

			function compare(a, b) {
				if (a.ElementInnerPosition < b.ElementInnerPosition)
					return -1;
				else if (a.ElementInnerPosition > b.ElementInnerPosition)
					return 1;
				else
					return 1;

			}
			dateArr.sort(compare); //sort element to make sure start date will be in first position in array

			var dateObj = that.getDateValueAndVisibility(evt.getSource().getSelectedKey());
			sap.ui.getCore().byId(dateArr[0].ElementId).setDateValue(dateObj.startDate);
			if (dateObj.endDate === '')
				sap.ui.getCore().byId(dateArr[1].ElementId).setValue(dateObj.endDate);
			else
				sap.ui.getCore().byId(dateArr[1].ElementId).setDateValue(dateObj.endDate);

			sap.ui.getCore().byId(dateArr[0].ElementId).setEnabled(dateObj.startDateEnable);
			sap.ui.getCore().byId(dateArr[1].ElementId).setEnabled(dateObj.endDateEnable);
			sap.ui.getCore().byId(dateArr[0].ElementId).setVisible(dateObj.startDateVisible);
			sap.ui.getCore().byId(dateArr[1].ElementId).setVisible(dateObj.endDateVisible);
		},
		
		/**
		 * It is used to maintian functionality for 'change' event of Selection Dropdown.
		 * Like odata service would be called whenever user is changing dropdown values, and 
		 * filter table would be refreshed with latest values.
		 * @function
		 * @private
		 */
		_onSelectionDropDownChange: function() {
			var filterTableVisibile = metro.gwf.reporting.util.UIHelper.getReportMasterData().SeltableActive;
			if(filterTableVisibile === 'X'){
			sap.ui.getCore().byId("filterTable").removeSelections();
			sap.ui.getCore().byId("filterTable").getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records", [0]));
			sap.ui.getCore().byId("filterTable").getInfoToolbar().getContent()[0].setText(that.getResourceBundle().getText("itemSelected", [0]));
			that.getModel("detailView").setProperty("/busyFilterTable", true);
			that.oDialog.getBeginButton().setEnabled(true);

			var oFilterColumn = that.getFilterSelections();
			oFilterColumn = oFilterColumn + " and FlagIndicator eq 'SELTABLE'";
			var oFilter = encodeURI(oFilterColumn);
			//binding columns data in selection table
			var o = function(d, r) {
				var tableColumn = []; 
				var data = d.results;
				for (var k in data) {
					var obj = {};
					obj.columnName = data[k].ColLable;
					tableColumn.push(obj);
				}
				sap.ui.getCore().byId("filterTable").getModel().setProperty("/columns", tableColumn);
				sap.ui.getCore().byId("filterTable").getModel().refresh(true);
				var sortModel = new sap.ui.model.json.JSONModel();
				sortModel.setData(tableColumn);
				that.setModel(sortModel, "sortModel");
			};
			that.getModel().read("/ColumnSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(o, this)
			});

			//binding rows data in selection table
			var f = function(d, r) {
				var tableRow = [];
				var data = d.results;
				for (var k in data) {
					var obj = {};
					$(Object.keys(data[k])).each(function(index, element) {
						if (element.indexOf("col") !== -1) {
							obj[element] = data[k][element];
						} else if (element.indexOf("Indicator") !== -1) {
							obj[element] = data[k][element];
						}
					});
					tableRow.push(obj);
				}
				sap.ui.getCore().byId("filterTable").getHeaderToolbar().getContent()[0].setText(that.getResourceBundle().getText("records",[tableRow.length]));
				sap.ui.getCore().byId("filterTable").getModel().setProperty("/rows", tableRow);
				sap.ui.getCore().byId("filterTable").getModel().refresh(true);
				that.getModel("detailView").setProperty("/busyFilterTable", false);

			};
			that.getModel().read("/ReportTableSet", {
				urlParameters: [oFilter],
				success: jQuery.proxy(f, this)
			});
			}
		},
		
		/**
		 * Dialog gets opened whenever user press filter icon(Button).
		 * @function
		 * @private
		 */
		onFilterPress: function() {
			this.oDialog.open();
		},
		
		/**
		 * Fetching records based on selection filters and update Detail table with new records.
		 * @function
		 * @private
		 */
		_onSubmitDialog: function() {
			//removing existing filter on click of submit
			that.byId("detailTable").getHeaderToolbar().getContent()[4].setValue('');
			that.byId("detailTable").getBinding("items").filter(null, "Application");
			
			var oFilterColumn = that.getFilterSelections();
			
			var filterTableVisibile = metro.gwf.reporting.util.UIHelper.getReportMasterData().SeltableActive;
			if(filterTableVisibile === 'X'){
			var selIds = sap.ui.getCore().byId("filterTable").getSelectedItems();
			var IDs = '';
			var indicator = '';
			for (var k in selIds) {
				var sPath = selIds[k].getBindingContext().getPath();
				IDs += sap.ui.getCore().byId("filterTable").getModel().getProperty(sPath).col2 + ",";
				indicator = sap.ui.getCore().byId("filterTable").getModel().getProperty(sPath).Indicator;
			}
			IDs = IDs.substring(0, IDs.length - 1);
			if (IDs == '') {
				MessageToast.show(that.getResourceBundle().getText("minRowSelectionMsg"));
			} else {
				that.getView().byId("oTokenizer").removeAllContent();
				that.buildTokens();
				//closing the dialog box on click of search button
				that.oDialog.close();
				that.getModel("detailView").setProperty("/busyTable", true);
				that.getModel("detailView").setProperty("/lineItemTableDelay", 0);
				that.getModel("detailView").setProperty("/exportBtnEnable", false);
				oFilterColumn = oFilterColumn.substring(0, ((oFilterColumn.length) - 1));
				oFilterColumn = oFilterColumn + "|ID~" + IDs + "|Indicator~" + indicator + "'" + " and FlagIndicator eq 'REPTABLE'";
				
			}
			}else{
				that.getView().byId("oTokenizer").removeAllContent();
				that.buildTokens();
				//closing the dialog box on click of search button
				that.oDialog.close();
				that.getModel("detailView").setProperty("/busyTable", true);
				that.getModel("detailView").setProperty("/lineItemTableDelay", 0);
				that.getModel("detailView").setProperty("/exportBtnEnable", false);
				oFilterColumn = oFilterColumn + " and FlagIndicator eq 'REPTABLE'"
			}
			
			var oFilter = oFilterColumn;
			oFilter = encodeURI(oFilter);
			
			that.fillDetailTableRows(oFilter);
		},

		/**
		 * Event handler when Cancel Button in dialog has been clicked
		 * On clicking, dialog box would be closed.
		 * @public
		 */
		_onCloseDialog: function() {
			this.oDialog.close();
		},

		/**
		 * Sort table based on selected column in dialog
		 * this function is used for both Detail Table as well as Filter(selection screen) table
		 * @function
		 * @param {sap.ui.base.Event} oEvent 
		 * @private
		 */
		_onSortingDialogConfirm: function(oEvent) {
			var oTable = that.sortingPopUpTable;
			var mParams = oEvent.getParameters();
			var oBinding = oTable.getBinding("items");
			// apply sorter to binding
			var aSorters = [];
			var path = mParams.sortItem.getBindingContext("sortDialogModel").getPath();
			var sPath = "col" + (parseInt(path.substring(1, path.length), 10) + 1);
			var bDescending = mParams.sortDescending;
			aSorters.push(new sap.ui.model.Sorter(sPath, bDescending));
			oBinding.sort(aSorters);
		},
		
		/**
		 * Do search in personalization dialog for Detail Table.
		 * Here column name can be searched.
		 * @function
		 * @param {sap.ui.base.Event} oEvent 
		 * @private
		 */
		_onPersonalizationDialogSearch: function(oEvent) {
			var sValue = oEvent.getParameter("value");
			var oFilter = new sap.ui.model.Filter("columnName", sap.ui.model.FilterOperator.Contains, sValue);
			var oBinding = oEvent.getSource().getBinding("items");
			oBinding.filter([oFilter]);
		},
		
		/**
		 * Showing all columns in personalization dialog, in which user can see all columns.
		 * he/she can select some columns and selected columns will be visible in detail table .
		 * @function
		 * @param {sap.ui.base.Event} oEvent 
		 * @private
		 */
		_onPersonalizationDialogConfirm: function(oEvent) {
			var tableData = that.getView().byId("detailTable").getModel("detailTableModel").getData().columns;
			for (var k in tableData) {
				tableData[k].columnVisible = false;
			}
			var aContexts = oEvent.getParameter("selectedContexts");
			if (aContexts && aContexts.length) {
				aContexts.map(function(oContext) {
					oContext.getObject().columnVisible = true;
					that.getView().byId("detailTable").getModel("detailTableModel").refresh(true);
				});
			}
			oEvent.getSource().getBinding("items").filter([]);
		},
		
		/**
		 * Export data in csv format when export to excel button is pressed.
		 * @function
		 * @param {sap.ui.base.Event} oEvent 
		 * @private
		 */
		onDataExport: sap.m.Table.prototype.exportData || function(oEvent) {
			var tableData = that.getView().byId("detailTable").getModel("detailTableModel").getData();
			var columnsArr = [];
			var columns = tableData.columns;
			for (var k in columns) {
				var columnObj = {};
				columnObj.name = columns[k].columnName;
				columnObj.template = {
					content: "{col" + ((parseInt(k, 10) + 1)) + "}"
				};
				columnsArr.push(columnObj);
			}
			
			var oExport = new Export({

				// Type that will be used to generate the content. Own ExportType's can be created to support other formats
				exportType: new ExportTypeCSV({
					separatorChar: ";"
				}),

				// Pass in the model created above
				models: that.getView().byId("detailTable").getModel("detailTableModel"),

				// // binding information for the rows aggregation
				rows: {
					path: "/rows",
					filters:that.oDetailTableFilter
				},
				
				// column definitions with column name and binding info for the content
				columns: columnsArr

			});
			var fileName = metro.gwf.reporting.util.UIHelper.getReportMasterData().Description;
			// // download exported file
			oExport.saveFile(fileName).catch(function(oError) {
				jQuery.sap.log.getLogger().error("Error when downloading data. Browser might not be supported!\n\n" + oError);
			}).then(function() {
				oExport.destroy();
			});
		},
		
		/**
		 * Createing dimension and measures based on Config table.
		 * For different reports, dimension and measures are varying.
		 * These are handled in configuration table
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		createDimensionAndMeasures: function() {
			var dimAndMeasures = metro.gwf.reporting.util.UIHelper.getDimensionAndMeasures();
			var rows = that.getView().byId("detailTable").getModel("detailTableModel").getProperty("/rows");
			if (dimAndMeasures.length === 0) {
				that.getModel("detailView").setProperty("/graphVisible", false);
			} else if ((dimAndMeasures.length === 1 || dimAndMeasures.length === 2)&&(rows.length)) {
				that.getModel("detailView").setProperty("/graphVisible", true);
			} else {
				that.getModel("detailView").setProperty("/graphVisible", false);
			}
			var chartContainer = that.getView().byId(that._constants.vizFrame.id).getParent().getParent();
			//	//handling visibility of chart button
			if (!that.getModel("detailView").getProperty("/graphVisible")) {
				chartContainer.updateChartContainer();
				return;
			} else {
				chartContainer.updateChartContainer();
			}
			//End of handling visibility of chart button
			var rows = that.getView().byId("detailTable").getModel("detailTableModel").getProperty("/rows");
			var graphData = [];
			var rowsData = [];
			if (dimAndMeasures[0] && dimAndMeasures[0].DimMeasure === 'D' && (dimAndMeasures[1] == undefined || null)) {
				var graphColumn = dimAndMeasures[0].Value;
				if (dimAndMeasures[0].ValueType === 'DATE' && dimAndMeasures[0].ValueIndicator === 'MONTH') {
					for (var k in rows) {
						var val = formatter.ddMMYYYYDate(rows[k][graphColumn]);
						rowsData.push(formatter.MONTH_mmm(val));
					}
						 var MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
						 rowsData.sort(function (a, b) {
						    return MONTHS[a]-MONTHS[b];
						});
				} else if (dimAndMeasures[0].ValueType === 'DATE' && dimAndMeasures[0].ValueIndicator === 'YEAR') {
					for (var k in rows) {
						var val = formatter.ddMMYYYYDate(rows[k][graphColumn]);
						rowsData.push(formatter.YEAR_yyyy(val));
						rowsData = rowsData.sort();
					}
				} else {
					for (var k in rows) {
						var val = rows[k][graphColumn];
						rowsData.push(val);
						rowsData = rowsData.sort();
					}
				}
				var count = {};
				rowsData.forEach(function(i) {
					count[i] = (count[i] || 0) + 1;
				});
				//Eg: count={jan:2,feb:2,dec:1}
				$(Object.keys(count)).each(function(index, element) {
					var obj = {};
					obj["dimension"] = element;
					obj["measure"] = count[element];
					graphData.push(obj);
				});
				//Eg: graphData = [{dimension:'Jan',measure:2},{dimension:'Feb',measure:2},{dimension:'Dec',measure:1}]
			} else if (dimAndMeasures[0] && dimAndMeasures[0].DimMeasure === 'D' && dimAndMeasures[1] && dimAndMeasures[1].DimMeasure === 'M') {
				var dimensionCol = dimAndMeasures[0].Value;
				var measureCols = dimAndMeasures[1].Value;
				var measureColNames = dimAndMeasures[1].Name;
				var measureColArr = (measureCols + "," + dimensionCol).split(',');
				for (var k in rows) {
					var val = {};
					for (var j in measureColArr) {
						val[measureColArr[j]] = rows[k][measureColArr[j]];
					}
					rowsData.push(val);
				}
				var arr = that.sumOfRecords(rowsData, dimensionCol, measureCols);
				graphData = arr;
				graphData.map(function(currentVal,index){
					$(Object.keys(currentVal)).each(function(indexVal, element,value) {
						measureCols.split(',').map(function(currentValue){
							if(element === currentValue){
								graphData[index][element] = typeof(currentVal[currentValue])==='string'?(currentVal[currentValue]).replace(',', '.'):currentVal[currentValue];//parseFloat(currentVal[currentValue]);
							}
						});
					});
				});
			}
			//when measure is not maintianed in configuration table, then If condition would be true
			//Like for some report, single column is treated as Dimension and from that column measure get calculated.
			if (!dimAndMeasures[1]) {
				that._constants.vizFrame.dataset.dimensions[0]["name"] = dimAndMeasures[0].Name; //'Birth Month';
				that._constants.vizFrame.dataset.dimensions[0]["value"] = "{dimension}";
				that._constants.vizFrame.dataset.measures = [];
				var obj = {};
				obj.name = dimAndMeasures[1] ? dimAndMeasures[1].Name : 'Count';
				obj.value = "{measure}";
				that._constants.vizFrame.dataset.measures.push(obj);
				that._constants.vizFrame.feedItems[0].values = [];
				var dimArr = [];
				dimArr.push(dimAndMeasures[1] ? dimAndMeasures[1].Name : 'Count');
				that._constants.vizFrame.feedItems[0].values = dimArr; //dimAndMeasures[1] ? dimAndMeasures[1].Name : 'Count';
				that._constants.vizFrame.feedItems[1].values[0] = dimAndMeasures[0].Name; //'Birth Month';
			} 
			//when both dimension and measures maintained in configuration table
			else {
				that._constants.vizFrame.dataset.dimensions[0]["name"] = dimAndMeasures[0].Name;
				that._constants.vizFrame.dataset.dimensions[0]["value"] = '{' + dimensionCol + '}';
				that._constants.vizFrame.dataset.measures = [];
				var obj = {};
				var measures = measureCols.split(',');
				var measureNames = measureColNames.split(',');
				$(Object.keys(measures)).each(function(index, element) {
					obj = {};
					obj.name = measureNames[index];
					obj.value = '{' + measures[element] + '}';
					that._constants.vizFrame.dataset.measures.push(obj);
				});
				that._constants.vizFrame.feedItems[0].values = []; // = dimAndMeasures[1] ? dimAndMeasures[1].Name : 'Count';
				that._constants.vizFrame.feedItems[0].values = measureNames;
				that._constants.vizFrame.feedItems[1].values[0] = dimAndMeasures[0].Name; //'Birth Month';
			}
			
			var oVizFrame = that.getView().byId(that._constants.vizFrame.id);
			that._updateVizFrame(oVizFrame, graphData);
		},
		
		/**
		 * When measure is not maintained in Config Table, then based on dimension, measure are getting calculated.
		 * Like Jan is repeating for 3 times, then dimension would be 'Jan' and measure would be 3
		 * @function
		 * @private
		 */
		sumOfRecords: function(arr, dimensionCol, measureCols) {
			var temp = {},
				index;
			var measureColArr = measureCols.split(',');
			var dimensionName = '';
			for (index = arr.length - 1; index >= 0; index -= 1) {
				dimensionName = arr[index][dimensionCol];
				if (temp.hasOwnProperty(dimensionName)) {
					for (var j in measureColArr) {
						arr[temp[dimensionName]][measureColArr[j]] = parseFloat(typeof(arr[temp[dimensionName]][measureColArr[j]])==='string'?arr[temp[dimensionName]][measureColArr[j]].replace(',', '.'):arr[temp[dimensionName]][measureColArr[j]]) + 
						parseFloat(typeof(arr[index][measureColArr[j]])==='string'?arr[index][measureColArr[j]].replace(',', '.'):arr[index][measureColArr[j]]);
					}
					arr.splice(index, 1);
					$(Object.keys(temp)).each(function(index, element) {
						temp[element] = temp[element] - 1;
					});
				} else {
					temp[dimensionName] = index;
				}
			}

			arr.sort(function(a, b) {
				if (a.dimensionCol === b.dimensionCol) {
					return 0;
				}
				if (a.dimensionCol < b.dimensionCol) {
					return -1;
				}
				return 1;
			});

			return arr;
		},
		/**
		 * Updated the Viz Frame in the view.
		 *
		 * @private
		 * @param {sap.viz.ui5.controls.VizFrame} vizFrame Viz Frame that needs to be updated
		 */
		_updateVizFrame: function(vizFrame, graphData) {
			var oVizFrame = that._constants.vizFrame;
			vizFrame.destroyDataset();
			var oDataset = new sap.viz.ui5.data.FlattenedDataset(oVizFrame.dataset);
			vizFrame.setDataset(oDataset);
			var oModel = new sap.ui.model.json.JSONModel(graphData);

			vizFrame.setModel(oModel);
			vizFrame.destroyFeeds();
			that._addFeedItems(vizFrame, oVizFrame.feedItems);
		},
		/**
		 * Adds the passed feed items to the passed Viz Frame.
		 *
		 * @private
		 * @param {sap.viz.ui5.controls.VizFrame} vizFrame Viz Frame to add feed items to
		 * @param {Object[]} feedItems Feed items to add
		 */
		_addFeedItems: function(vizFrame, feedItems) {
			for (var i = 0; i < feedItems.length; i++) {
				vizFrame.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem(feedItems[i]));
			}
		},
		/**
		 * Function is used to handle export button visibility.
		 *
		 * @private
		 * @param {sap.viz.ui5.controls.VizFrame} vizFrame Viz Frame to add feed items to
		 * @param {Object[]} feedItems Feed items to add
		 */
		attachContentChange:function(oEvent){
			var tableContent = oEvent.getSource().getContent()[0];
			if(tableContent === oEvent.getSource().getSelectedContent()){
				that.getModel("detailView").setProperty("/exportButtonVisible",true);
			}else{
				that.getModel("detailView").setProperty("/exportButtonVisible",false);
			}
		},
		onChartTypeChange:function(oEvent){
			var oVizFrame = that.getView().byId(that._constants.vizFrame.id);
			oVizFrame.setVizType(oEvent.getSource().getSelectedKey());
		}

	});

});
//# sourceURL=https://webidetesting3853782-a6ddb99a1.dispatcher.hana.ondemand.com/webapp/controller/Detail.controller.js?eval