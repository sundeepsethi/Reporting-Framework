/*
 * Copyright (C) 2009-2014 SAP SE or an SAP affiliate company. All rights reserved
 */
jQuery.sap.declare("metro.gwf.reporting.util.UIHelper");
// jQuery.sap.require("sap.ui.core.format.NumberFormat");
metro.gwf.reporting.util.UIHelper = (function() {
	var selectionData = null;
	var reportMasterData = null;
	var varientData=[];
	var serviceModel= null;
	var dimensionAndMeasures=null;
	var baseControllerReference=null;
	return {
		setSelectionData:function(data){
			selectionData=data;
		},
		getSelectionData:function(){
			return selectionData;
		},
		setReportMasterData:function(data){
			reportMasterData=data;
		},
		getReportMasterData:function(){
			return reportMasterData;
		},
		setVarientData:function(data){
			varientData = data;
		},
		getVarientData:function(){
			return varientData;
		},
		setServiceModel:function(model){
			serviceModel = model;
		},
		getServiceModel:function(){
			return serviceModel;
		},
		setBaseControllerReference:function(data){
			baseControllerReference = data; 
		},
		getBaseControllerReference:function(data){
			return baseControllerReference;
		},
		setDimensionAndMeasures:function(data){
			dimensionAndMeasures = data;
		},
		getDimensionAndMeasures:function(){
			return dimensionAndMeasures;
		},
		getCurrentYearInitialDate:function(){
			var currentDate = new Date();
			var date = new Date(currentDate.getFullYear(),0/*new Date().getMonth()*/,1/*new Date().getDate()*/);
			return date;
		},
		getCurrentYearEndDate:function(){
			var currentDate = new Date();
			var date = new Date(currentDate.getFullYear(),11/*new Date().getMonth()*/,31/*new Date().getDate()*/);
			return date;
		},
		getCurrentMonthInitialDate:function(){
			var currentDate = new Date();
			var date = new Date(currentDate.getFullYear(),currentDate.getMonth(),1/*new Date().getDate()*/);
			return date;
		},
		getCurrentMonthEndDate:function(){
			var currentDate = new Date();
			var date = new Date(currentDate.getFullYear(),currentDate.getMonth()+1,0/*new Date().getDate()*/);
			return date;
		},
		getInitialDate:function(){
			var currentDate = new /*Date(0);//*/Date(1800,0,1);
			var date = new Date(currentDate.getFullYear(),currentDate.getMonth(),1/*new Date().getDate()*/);
			return date;
		},
		getEndDate:function(){
			var dateVal = new Date(9999,11,31/*new Date().getDate()*/);
			var date = new Date(dateVal.getFullYear(),dateVal.getMonth(),31/*new Date().getDate()*/);
			return date;
		},
		getTodayDate:function(){
			return (new Date());
		}
	};
}());