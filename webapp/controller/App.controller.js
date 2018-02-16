// jQuery.sap.require("metro.gwf.reporting.util.dynamicControl");
jQuery.sap.require("metro.gwf.reporting.util.UIHelper");
sap.ui.define([
		"metro/gwf/reporting/controller/BaseController",
		"sap/ui/model/json/JSONModel",
		"../util/ToggleFullScreenHandler"
	], function (BaseController, JSONModel,ToggleFullScreenHandler) {
		"use strict";

		return BaseController.extend("metro.gwf.reporting.controller.App", {

			onInit : function () {
				var oViewModel,
					fnSetAppNotBusy,
					oListSelector = this.getOwnerComponent().oListSelector,
					iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();

				oViewModel = new JSONModel({
					busy : true,
					delay : 0
				});
				this.setModel(oViewModel, "appView");

				fnSetAppNotBusy = function() {
					oViewModel.setProperty("/busy", false);
					oViewModel.setProperty("/delay", iOriginalBusyDelay);
				};

				this.getOwnerComponent().getModel().metadataLoaded()
						.then(fnSetAppNotBusy);

				// Makes sure that master view is hidden in split app
				// after a new list entry has been selected.
				oListSelector.attachListSelectionChange(function () {
					this.byId("idAppControl").hideMaster();
				}, this);

				// apply content density mode to root view
				this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
				
				
				//set the service model
				metro.gwf.reporting.util.UIHelper.setServiceModel(this.getOwnerComponent().getModel());
				
				metro.gwf.reporting.util.UIHelper.setBaseControllerReference(this);
				
				//setting split app in ToggleFullScreenHandler file
				ToggleFullScreenHandler._setSplitApp(this.getView());
			}

		});

	}
);