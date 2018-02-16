/*!
 * UI development toolkit for HTML5 (OpenUI5)
 * (c) Copyright 2009-2017 SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */

// Provides a simple search feature
sap.ui.define(['jquery.sap.global'],
	function(jQuery) {
	"use strict";


	var ToggleFullScreenHandler = {

		updateMode : function(oEvt, oController) {
			if (!this._oShell) {
				this._oShell = sap.ui.getCore().byId('shell');
			}
			var bSwitchToFullScreen = (this._getSplitApp().getMode() === "ShowHideMode");
			if (bSwitchToFullScreen) {
				this._getSplitApp().setMode('HideMode');
			} else {
				this._getSplitApp().setMode('ShowHideMode');
			}
			this.updateControl(oEvt.getSource(), oController, bSwitchToFullScreen);
		},


		_getSplitApp : function () {
			// if (!this._oSplitApp) {
			// 	this._oSplitApp = sap.ui.getCore().byId('idAppControl');
			// }
			return this._oSplitApp;
		},
		
		_setSplitApp:function(oView){
			if (!this._oSplitApp) {
			this._oSplitApp = oView.byId('idAppControl');
			}
		},

		updateControl : function (oButton, oController, bFullScreen) {
			if (arguments.length === 2) {
				bFullScreen = !(this._getSplitApp().getMode() === "ShowHideMode");
			}
			var i18nModel = oController.getResourceBundle();
			if (!bFullScreen) {
				oButton.setTooltip(i18nModel.getText('sampleFullScreenTooltip'));
				oButton.setIcon('sap-icon://full-screen');
			} else {
				oButton.setTooltip(i18nModel.getText('sampleExitFullScreenTooltip'));
				oButton.setIcon('sap-icon://exit-full-screen');
			}
		},

		cleanUp : function() {
			this._oSplitApp = null;
			this._oShell = null;
		}
	};

	return ToggleFullScreenHandler;

}, /* bExport= */ true);