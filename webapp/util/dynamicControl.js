/*
 * Copyright (C) 2009-2014 SAP SE or an SAP affiliate company. All rights reserved
 */
jQuery.sap.declare("metro.gwf.reporting.util.dynamicControl");
// jQuery.sap.require("metro.gwf.reporting.util.UIHelper");
metro.gwf.reporting.util.dynamicControl = (function() {
 	return {
createDynContent: function(controlData) {
	function compare(a, b) {
			if (a.ElementPosition < b.ElementPosition)
				return -1;
			else if (a.ElementPosition > b.ElementPosition)
				return 1;
			else if (a.ElementPosition == b.ElementPosition){
			if(a.ElementInnerPosition < b.ElementInnerPosition)
				return -1;
			else if(a.ElementInnerPosition > b.ElementInnerPosition)
				return 1;
			else
				return 1;
			}
			else
				return 1;
		}
	controlData.sort(compare);
	var baseControllerReference = metro.gwf.reporting.util.UIHelper.getBaseControllerReference();
	var TIMEPERIOD = [{
		"LookupKeyword": "TIMEPERIOD",
		"Key": "today",
		"Value": baseControllerReference.getResourceBundle().getText("Today")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "currentMonth",
		"Value": baseControllerReference.getResourceBundle().getText("currentMonth")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "currentYear",
		"Value": baseControllerReference.getResourceBundle().getText("currentYear")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "all",
		"Value": baseControllerReference.getResourceBundle().getText("all")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "pastUntilToday",
		"Value": baseControllerReference.getResourceBundle().getText("pastUntilToday")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "futureFromToday",
		"Value": baseControllerReference.getResourceBundle().getText("futureFromToday")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "keyDate",
		"Value": baseControllerReference.getResourceBundle().getText("keyDate")
	}, {
		"LookupKeyword": "TIMEPERIOD",
		"Key": "otherPeriod",
		"Value": baseControllerReference.getResourceBundle().getText("otherPeriod")
	}];
	var len = controlData.length;
	if (len == 0) {
		return null;
	}
	// return null;
	var simpleForm = new sap.ui.layout.form.SimpleForm({
		editable:true,
		layout:"ResponsiveGridLayout",
		labelSpanXL:3,
		labelSpanL:3,
		labelSpanM:3,
		labelSpanS:12,
		adjustLabelSpan:false,
		emptySpanXL:0,
		emptySpanL:0,
		emptySpanM:0,
		emptySpanS:0,
		columnsXL:1,
		columnsL:1,
		columnsM:1,
		singleContainerFullSize:false
	});
	var index = 0;
	while (index < len) {
		if ((controlData[index].ElementType) && controlData[index].ElementType === "LABLE") {
			var label = new sap.m.Label({
				visible: (controlData[index].Visible === "X") ? true : false,
				id: controlData[index].ElementId,
				text: controlData[index].Text
			});
			simpleForm.addContent(label);
		}
		else if((controlData[index].ElementType)  && (controlData[index].ElementType === "INPUT")){
			if((controlData[index].ValueType) && (controlData[index].ValueType === "DATE")){
			var uIpControl = new sap.m.DatePicker({
						id: controlData[index].ElementId,
						placeholder: controlData[index].PlaceHolder,
						displayFormat :"MM/dd/yyyy",
						visible: (controlData[index].Visible === "X") ? true : false,
						customData: [{
							filter: controlData[index].FilterKeyword
						}]
					});
					simpleForm.addContent(uIpControl);
			}
			else if((controlData[index].ValueType) && (controlData[index].ValueType === "COMBO")){
			
					var jsonArr = [];
					var oModel = new sap.ui.model.json.JSONModel();
					var reportKeyword = controlData[index].ReportKeyword;
					var oFilter = "$filter=LookupKeyword eq '" + controlData[index].LookupKeyword + "' and ReportKeyword eq '"+reportKeyword+"'";
					oFilter = encodeURI(oFilter);
					this.serviceModel = metro.gwf.reporting.util.UIHelper.getServiceModel();
					var uIpControl = new sap.m.Select({
						id: controlData[index].ElementId,
						placeholder: controlData[index].PlaceHolder,
						items: {
							path: "/",
							template: new sap.ui.core.Item({
								text: "{Value}",
								key: "{Key}"
							})
						}
						
					});
					if (controlData[index].LookupKeyword === 'TIMEPERIOD'){
						jsonArr = TIMEPERIOD;
						
					oModel.setData(jsonArr);
					}
					else{
					this.serviceModel.read("/DropDownValueSet",{
					urlParameters: [oFilter],
					success:function(oData, oResponse) {
						jsonArr = oData.results;
						oModel.setData(jsonArr);
					
					}
					});
					}
					uIpControl.setModel(oModel);
					oModel.updateBindings(true);
					simpleForm.addContent(uIpControl);
			}
		}
		index++;
	}
	 return simpleForm;

}
};
}());