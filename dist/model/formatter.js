jQuery.sap.require("sap.ca.ui.model.format.DateFormat");
sap.ui.define([], function() {
	"use strict";

	return {
		/**
		 * Rounds the currency value to 2 digits
		 *
		 * @public
		 * @param {string} sValue value to be formatted
		 * @returns {string} formatted currency value with 2 digits
		 */
		currencyValue: function(sValue) {
			if (!sValue) {
				return "";
			}

			return parseFloat(sValue).toFixed(2);
		},
		formatDaysAgo: function(d) {
			if (d != null && d!='') {
				var a = new Date(d);
				var c = new sap.ui.core.Configuration();
				var b = c.getLocale().sLocaleId;
				var F = sap.ui.core.format.DateFormat.getDateInstance({
					pattern: "YYYY-MM-dd"
				}, new sap.ui.core.Locale(b));
				var l = F.format(a
					/*, ({
										style: "short",
										UTC: true
									})*/
				);
				var arr = l.split('-');
				arr[0]=d.getFullYear();
				l=arr[0]+"-"+arr[1]+"-"+arr[2];
				return l;
			}
		},
		ddMMYYYYDate: function(d) {
			if (d === undefined)
				return "";
			var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "dd.MM.YYYY"
			});
			var fullDate = D.parse(d);
			if(fullDate == null || fullDate == undefined){
				return new Date(d);
			}else{
				return fullDate;
			}
			
		},
		MONTH_mmm: function(d) {
			if (d === undefined)
				return "";
			var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "MMM"
			});
			return D.format(d);
		},
		MONTH_mm: function(d) {
			if (d === undefined)
				return "";
			var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "mm"
			});
			return D.format(d);
		},
		YEAR_yyyy: function(d) {
			if (d === undefined)
				return "";
			var D = sap.ui.core.format.DateFormat.getDateTimeInstance({
				pattern: "YYYY"
			});
			return D.format(d);
		}
	};

});