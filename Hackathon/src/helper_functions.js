export const opWr = (no_of_cols, value, title, latex_before_equal_sign, unit) => {
	if (no_of_cols === 4) {
		return `<div class="row nobreak">
                    <div class="col1">${title}</div>
                    <div class="col2">$$ ${latex_before_equal_sign} = $$</div>
                    <div class="col3">${value}</div>
                    <div class="col4">${unit}</div>
                </div>`;
	}
	if (no_of_cols === 2) {
		return `<div class="row nobreak">
                    <div class="col_full">${title}: ${value}</div>    
                </div>`;
	}
	if (isNaN(value) || value === 0) return '';
};

export const opWr_text = (title1, val1, title2, val2) => {
	return `<div class="row nobreak">
                <div class="col_full">
                    ${title1}: ${val1}, ${title2}: ${val2} 
                </div>
            </div>`;
};

export const opWr_eq = (title, equation, value, unit, eqUseLatex = true) => {
	let eqStr = '';
	if (eqUseLatex) eqStr = `${title}: \\( \\${equation} = \\) ${value} ${unit}`;
	else eqStr = `${title}: \\( ${equation} = \\) ${value} ${unit}`;
	return `<div class="row nobreak">
                <div class="col_full">
                    ${eqStr}
                </div>
            </div>`;
};

export const opWr_eqNoTitle = (eq, value, unit) => {
	return `<div class="row nobreak">
                <div class="col_full">
                
                \\( ${eq} = \\) ${value} ${unit} 
                </div>
            </div>`;
};

export const opWr_eqOnly = (eq) => {
	return `<div class="row nobreak">
                <div class="col_full">
                \\( ${eq} \\)
                </div>
            </div>`;
};

export const opWr_2eqs = (
	title,
	equation1,
	value1,
	unit1,
	equation2,
	value2,
	unit2,
	eqsUseLatex = true
) => {
	let eqStr = '';
	if (eqsUseLatex)
		eqStr = `${title}: \\( \\${equation1} = \\) ${value1} ${unit1}, \\( \\${equation2} = \\) ${value2} ${unit2}`;
	else
		eqStr = `${title}: \\( ${equation1} = \\) ${value1} ${unit1}, \\( ${equation2} = \\) ${value2} ${unit2}`;
	return `<div class="row nobreak">
                <div class="col_full">
                    ${eqStr}
                </div>
            </div>`;
};

export const opWr_2eqs_2titles = (
	title1,
	equation1,
	value1,
	unit1,
	title2,
	equation2,
	value2,
	unit2
) => {
	return `<div class="row nobreak">
                <div class="col_full">
                    ${title1}: \\( \\${equation1} = \\) ${value1} ${unit1}, ${title2}: \\( \\${equation2} = \\) ${value2} ${unit2}
                </div>
            </div>`;
};

export const opWr_2eqs_2titles_noLatex = (
	title1,
	equation1,
	value1,
	unit1,
	title2,
	equation2,
	value2,
	unit2
) => {
	return `<div class="row nobreak">
                <div class="col_full">
                    ${title1}: \\( ${equation1} = \\) ${value1} ${unit1}, ${title2}: \\( ${equation2} = \\) ${value2} ${unit2}
                </div>
            </div>`;
};

export const opWr_oneLine = (title, equation) => {
	return `<div class="row nobreak">
                <div class="col_full">
                    ${title}: \\( ${equation} \\)
                </div>
            </div>`;
};

export const opWr_title = (title) => {
	return `<div class="row nobreak">
                <div class="col_full">
                    <strong>${title}:</strong>
                </div>
            </div>`;
};

export const formatNumber = (n) => {
	if (n % 1 === 0) return n;
	if (n % 1 != 0) return n.toFixed(2);
};

export const dimensionsDoc = (dim_obj) => {
	const title = `The Geometric Type of the Cross Section Analysis is`;
	let dimString = ``;
	for (const key in dim_obj) {
		if (key === `geometry_type`) {
			dimString += opWr(2, dim_obj[key], title, '', '');
		} else {
			dimString += opWr(4, dim_obj[key][0], dim_obj[key][1], dim_obj[key][2], dim_obj[key][3]);
		}
	}
	return dimString;
};

export const verificationOutputter = (results_obj) => {
	let URs = [];
	Object.entries(results_obj).forEach(([value]) => {
		URs.push(results_obj[value]['UR_total']);
	});
	const UR_index = URs.indexOf(Math.max(...URs)) + 1;

	let verificationTableString = `<div class="table-responsive">
                                        <table class="table table-padding">
                                            <thead class="thead-orange-output">
                                                <th>#</th>
                                                <th>Analysis</th>
                                                <th>Crack Width [mm]</th>
                                                <th>M<sub>Rd</sub> [kNm]</th>
                                                <th>V<sub>Rd</sub> [kN]</th>
                                                <th>UR</th>
                                                <th>UR<sub>V</sub> [kN]</th>
                                                <th>Verified?</th>
                                            </thead>
                                            <tbody>`;

	Object.entries(results_obj).forEach(([value]) => {
		if (Number(value) === UR_index) {
			verificationTableString += `<tr style="background-color: #AFE0F0;">`;
		} else {
			verificationTableString += `<tr>`;
		}

		verificationTableString += `
                                        <td>${results_obj[value]['analysis_no']}</td>
                                        <td>${results_obj[value]['limit_state']}</td>
                                        <td>${crack_width_formatter(
																					results_obj[value]['crack_width'],
																					results_obj[value]['limit_state']
																				)}</td>
                                        <td>${M_Rd_formatter(
																					results_obj[value]['M_Rd'],
																					results_obj[value]['limit_state']
																				)}</td>
                                        <td>${V_Rd_formatter(
																					results_obj[value]['V_Rd'],
																					results_obj[value]['limit_state']
																				)}</td>
                                        <td>${Rounder(results_obj[value]['UR_total'], 2)}</td>
                                        <td>${UR_V_total_formatter(
																					results_obj[value]['UR_V'],
																					results_obj[value]['limit_state']
																				)}</td>
                                        <td>${IsOk_formatter(results_obj[value]['IsOk'])}</td>
                                    </tr>`;
	});

	// end of tabe
	verificationTableString += `</tbody>
                                        </table>
                                    </div>`;

	return verificationTableString;
};

export const loadsOutputter = (loads_input) => {
	loadsTableString = `<div class="table-responsive">
                            <table class="table table-padding">
                                <thead class="thead-orange-output">
                                    <th>#</th>
                                    <th>Normal force [kN]</th>
                                    <th>Moment z-axis [kNm]</th>
                                    <th>Shear z-axis [kN]</th>
                                    <th>Moment y-axis [kNm]</th>
                                    <th>Shear y-axis [kN]</th>
                                    <th>Torsion</th>
                                    <th>Limit state</th>

                                </thead>
                                <tbody>`;
	Object.entries(loads_input).forEach(([value]) => {
		loadsTableString += `<tr>
                                <td>${loads_input[value]['analysis_no']}</td>
                                <td>${loads_input[value]['SectionForces']['N']}</td>
                                <td>${loads_input[value]['SectionForces']['Mz']}</td>
                                <td>${loads_input[value]['SectionForces']['Vz']}</td>
                                <td>${loads_input[value]['SectionForces']['My']}</td>
                                <td>${loads_input[value]['SectionForces']['Vy']}</td>
                                <td>${loads_input[value]['SectionForces']['T']}</td>
                                <td>${loads_input[value]['SectionForces']['Verification']}</td>
                            </tr>`;
	});

	// end of tabe
	loadsTableString += `</tbody>
                                        </table>
                                    </div>`;

	return loadsTableString;
};

export const fibresDoc = (Fibres) => {
	let fibresString = ``;

	fibresString += opWr(2, Fibres.content, 'The Fiber Dosage is', '', '');
	fibresString += opWr(
		4,
		Fibres.f_R1k,
		'Residual Flexural Tensile Strength (CMOD1 = 0.5 mm), characteristic',
		'f_{R1k}',
		'MPa'
	);
	fibresString += opWr(
		4,
		Fibres.f_R2k,
		'Residual Flexural Tensile Strength (CMOD2 = 1.5 mm), characteristic',
		'f_{R2k}',
		'MPa'
	);
	fibresString += opWr(
		4,
		Fibres.f_R3k,
		'Residual Flexural Tensile Strength (CMOD3 = 2.5 mm), characteristic',
		'f_{R3k}',
		'MPa'
	);
	fibresString += opWr(
		4,
		Fibres.f_R4k,
		'Residual Flexural Tensile Strength (CMOD4 = 3.5 mm), characteristic',
		'f_{R4k}',
		'MPa'
	);

	return fibresString;
};

export const steelDoc = (Reinforcement) => {
	let steelString = ``;
	steelString += `Hej`;

	return steelString;
};

export const Rounder = (number, digits = 2) =>
	Math.round((number + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);

export const crack_width_formatter = (crack_width, limit_state) => {
	let res;
	if (limit_state === 'SLS') crack_width < 0 ? (res = 0) : (res = Rounder(crack_width, 2));
	else res = `<i class="fa fa-2x fa-minus"></i>`;
	return res;
};

export const M_Rd_formatter = (M_Rd, limit_state) => {
	return limit_state === 'SLS' ? `<i class="fa fa-2x fa-minus"></i>` : Rounder(M_Rd, 2);
};

export const V_Rd_formatter = (V_Rd, limit_state) => {
	return limit_state === 'SLS' ? `<i class="fa fa-2x fa-minus"></i>` : Rounder(V_Rd, 2);
};

export const UR_V_total_formatter = (UR_V_total, limit_state) => {
	return limit_state === 'SLS' ? `<i class="fa fa-2x fa-minus"></i>` : Rounder(UR_V_total, 2);
};

export const IsOk_formatter = (IsOk) => {
	if (IsOk) {
		return `<i class="far fa-2x fa-check-circle text-success" style="float: right;"></i>`;
	} else {
		return `<i class="far fa-2x fa-times-circle text-danger" style="float: right;"></i>`;
	}
};

// return the object with the highest UR_total
export const getMostRelevantAnalysis = (obj) => {
	let res_arr = [];
	for (const k in obj) res_arr.push(obj[k]);
	let analysisWithHighestUR_total = res_arr.reduce((max, util) =>
		max.UR_total > util.UR_total ? max : util
	);
	return analysisWithHighestUR_total;
};

export const getAnalyses = (obj) => {
	let worst_SLS_UR = [];
	let worst_ULS_UR = [];
	let worst_ULS_UR_V = [];

	for (const k in obj) {
		if (obj[k].limit_state === 'SLS') worst_SLS_UR.push(obj[k]);
		if (obj[k].limit_state === 'ULS') {
			worst_ULS_UR.push(obj[k]);
			worst_ULS_UR_V.push(obj[k]);
		}
	}

	// TERNARYS CHECK IF THEY ARE THERE
	var SLSWithHighestUR_total = null;
	var ULSWithHighestUR_total = null;
	var ULSWithHighestUR_V = null;

	worst_SLS_UR.length > 0
		? (SLSWithHighestUR_total = worst_SLS_UR.reduce((max, util) =>
				max.UR_total > util.UR_total ? max : util
		  ))
		: (SLSWithHighestUR_total = null);
	worst_ULS_UR.length > 0
		? (ULSWithHighestUR_total = worst_ULS_UR.reduce((max, util) =>
				max.UR_total > util.UR_total ? max : util
		  ))
		: (ULSWithHighestUR_total = null);
	worst_ULS_UR_V.length > 0
		? (ULSWithHighestUR_V = worst_ULS_UR_V.reduce((max, util) =>
				max.UR_V > util.UR_V ? max : util
		  ))
		: (ULSWithHighestUR_V = null);

	return {
		SLSWithHighestUR_total,
		ULSWithHighestUR_total,
		ULSWithHighestUR_V,
	};
};

export const drawResultsTable = (obj) => {
	// clear table body, tbody, before populating it
	$('#cross_section_results_table_tbody tr').remove();

	var tableRef = document
		.getElementById('cross_section_results_table')
		.getElementsByTagName('tbody')[0];

	resultsLoop: for (const k in obj) {
		console.log(obj[k]);

		const isValid = document.getElementById('load_status' + k);
		if (isValid.className.includes('hourglass')) continue resultsLoop; //if a load combination is not ready, do not display in the table

		const limit_state = obj[k].limit_state;
		const crack_width = crack_width_displayer(limit_state, Round(obj[k].crack_width, 2));
		const M_Rd = M_Rd_displayer(limit_state, Round(obj[k].M_Rd, 2));
		const V_Rd = V_Rd_displayer(limit_state, Round(obj[k].V_Rd, 2));
		const UR_total = Round(obj[k].UR_total, 2);
		const UR_V = UR_V_displayer(limit_state, Round(obj[k].UR_V, 2));
		const verified = isVerified(obj[k].IsOk);

		tableRef.insertRow().innerHTML =
			`<td>${k}</td>` +
			`<td>${limit_state}</td>` +
			`<td>${crack_width}</td>` +
			`<td>${M_Rd}</td>` +
			`<td>${V_Rd}</td>` +
			`<td>${UR_total}</td>` +
			`<td>${UR_V}</td>` +
			`<td>${verified}</td>`;
	}
};

export const ucfirst = (str) => {
	return str.charAt(0).toUpperCase() + str.slice(1);
};

export const Round = (number, digits = 2) =>
	Math.round((number + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);

// helper function to evaluate the IsOk (verified status) variable
export const isVerified = (IsOk) => {
	if (IsOk) {
		return `<i class="far fa-2x fa-check-circle text-success" style="float: right;"></i>`;
	} else {
		return `<i class="far fa-2x fa-times-circle text-danger" style="float: right;"></i>`;
	}
};

export const crack_width_displayer = (limit_state, crack_width) => {
	// if(limit_state === 'SLS') return crack_width
	if (limit_state === 'SLS') return crack_width < 0 ? 0 : crack_width;
	if (limit_state === 'ULS') return `<i class="far fa-2x fa-minus"></i>`;
};

export const M_Rd_displayer = (limit_state, M_Rd) => {
	if (limit_state === 'SLS') return `<i class="far fa-2x fa-minus"></i>`;
	if (limit_state === 'ULS') return M_Rd;
};

export const UR_V_displayer = (limit_state, UR_V) => {
	if (limit_state === 'SLS') return `<i class="far fa-2x fa-minus"></i>`;
	if (limit_state === 'ULS') return UR_V;
};

export const V_Rd_displayer = (limit_state, V_Rd) => {
	if (limit_state === 'SLS') return `<i class="far fa-2x fa-minus"></i>`;
	if (limit_state === 'ULS') return V_Rd;
};

export const show_loader = () => {
	console.log('show_loader ???');
	document.getElementById('cross_section_load_screen').classList.remove('hidden');
};

export const hide_loader = () => {
	console.log('hide_loader ???');
	document.getElementById('cross_section_load_screen').classList.add('hidden');
};

export const createHeatMap = (analysis_object, div_id) => {
	// console.log(analysis_object.Analysis)

	let tempScale = {
		min: {
			value: analysis_object.Analysis.sig_c_min,
			hue: 1,
		},
		max: {
			value: analysis_object.Analysis.sig_c_max,
			hue: 255,
		},
		off: {
			value: 0,
		},
	};

	var canvas = document.getElementById(div_id);
	var ctx = canvas.getContext('2d');

	// background
	ctx.fillStyle = 'transparent';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// set scaling
	let Max_dim = Math.max(
		analysis_object.Analysis.Geometry.height,
		analysis_object.Analysis.Geometry.width
	);
	let scale = (0.85 * Math.min(canvas.width, canvas.height)) / Max_dim;

	// get offset to center
	var offset_y = canvas.height / 2;
	var offset_x = canvas.width / 2;

	// draw slices with specfic colors
	for (let i = 0; i < analysis_object.Analysis.Geometry.slices.length; i++) {
		let color = temperatureToColor(analysis_object.Analysis.sig_c[i], tempScale);
		let border = ''; //color;
		let coords = [];

		analysis_object.Analysis.Geometry.slices[i].nodes.forEach((node) => {
			coords.push([node.y * scale, -node.z * scale]);
		});
		DrawShape(ctx, coords, offset_y, offset_x, color, border, 0.1);
	}

	// draw reinforcement
	for (let i = 0; i < analysis_object.Analysis.y_s.length; i++) {
		let color = temperatureToColor(analysis_object.Analysis.sig_s[i], tempScale);
		drawCircle(
			ctx,
			analysis_object.Analysis.y_s[i] * scale + offset_x,
			-analysis_object.Analysis.z_s[i] * scale + offset_y,
			(analysis_object.Analysis.Reinforcement.dia[i] / 2) * scale,
			color,
			'black',
			0.5
		);
	}

	// draw contour
	let fill = '';
	let stroke = '#061258';
	analysis_object.Analysis.Geometry.Contour.forEach((contour) => {
		let coords = [];

		for (let i = 0; i < contour.x.length; i++) {
			coords.push([contour.x[i] * scale, -contour.y[i] * scale]);
		}

		DrawShape(ctx, coords, offset_y, offset_x, fill, stroke, 2);
	});
};

const colors = ['#3434b7', '#08BE88', '#ff6622', '#061258', '#AFE0F0'];

if (typeof Highcharts !== 'undefined') {
	Highcharts.setOptions({
		colors: colors,
		chart: {
			style: {
				fontFamily: 'ApercuLight, sans-serif',
			},
			animation: false,
			spacing: 0,
			backgroundColor: 'transparent',
		},
	});
}

const legendStyle = {
	align: 'center',
	verticalAlign: 'bottom',
	margin: 0,
	padding: 2,
};

export function plotStressStrain(analysis_obj, div_id) {
	// range of stress plot:
	let stress_range = Math.max.apply(null, analysis_obj.Analysis.sig_c.map(Math.abs));
	stress_range = Math.round((stress_range + 3) / 5) * 5; // round to multiple of 5
	let max_eps = Math.max.apply(null, analysis_obj.Analysis.eps_c.map(Math.abs));
	max_eps = Math.round((max_eps + 1 / 1000) * 1000); // round to nearest 0.001
	let max_sig_s = Math.max.apply(null, analysis_obj.Analysis.sig_s.map(Math.abs));
	max_sig_s = Math.round((max_sig_s + 25) / 50) * 50;

	let list = [];

	if (typeof Highcharts === 'undefined') {
		let Highcharts = {};
		console.error('HighCharts not found');
	}

	for (let i = 0; i < analysis_obj.Analysis.sig_c.length; i++) {
		list.push({ sig_c: analysis_obj.Analysis.sig_c[i], z_c: analysis_obj.Analysis.z_c[i] });
	}

	list.sort(function (a, b) {
		return a.z_c < b.z_c ? -1 : a.z_c === b.z_c ? 0 : 1;
	});

	let concrete_stress = [];

	for (let i = 0; i < list.length; i++) {
		concrete_stress.push([list[i].sig_c, list[i].z_c]);
	}

	let strain = [];
	for (let i = 0; i < analysis_obj.Analysis.eps_c.length; i++) {
		strain[i] = [analysis_obj.Analysis.eps_c[i] * 1000, analysis_obj.Analysis.z_c[i]];
	}

	let stress_strain_chart = Highcharts.chart(div_id, {
		title: {
			text: null,
		},
		subtitle: {
			text: `<i>M</i> = ${Rounder(analysis_obj.Analysis.Mz, 2)} kNm`,
		},

		tooltip: {
			formatter: function () {
				const title = this.series.name.split(' ').slice(0, -1).join(' ');
				const value = Rounder(this.x, 2);
				const unit = this.series.name.split(' ').at(-1).slice(1, -1);
				const section_height = Rounder(this.y, 2);

				if (unit === '‰')
					return `${title}: ${value}${unit} <br> Section height: ${section_height} mm`;
				return `${title}: ${value} ${unit} <br> Section height: ${section_height} mm`;
			},
			borderRadius: 0,
		},

		yAxis: {
			title: {
				text: 'Section height [mm]',
			},
		},

		xAxis: [
			{
				// Stress [MPa] graph
				type: 'linear',
				min: -stress_range,
				max: stress_range,
				labels: {
					style: {
						color: '#3434b7',
					},
				},
				gridLineWidth: 1,
			},
			{
				// Strain graph
				type: 'linear',
				min: -max_eps,
				max: max_eps,
				labels: {
					style: {
						color: '#08BE88',
					},
					formatter: function () {
						return `${this.value}‰`;
					},
				},
				opposite: true,
			},
			{
				// Reinf. stress
				type: 'linear',
				min: -max_sig_s,
				max: max_sig_s,
				labels: {
					style: {
						color: '#ff6622',
					},
				},
			},
		],

		legend: legendStyle,

		series: [
			{
				name: 'Stress [MPa]',
				type: 'scatter',
				data: concrete_stress,
				lineWidth: 1,
				marker: {
					enabled: false,
				},
			},
			{
				name: 'Strain [‰]',
				type: 'scatter',
				data: strain,
				lineWidth: 1,
				marker: {
					enabled: false,
				},
				xAxis: 1,
			},
			{
				name: 'Reinf. stress [MPa]',
				type: 'scatter',
				data: [],
				marker: {
					radius: 3,
					symbol: 'circle',
				},
				xAxis: 2,
			},
		],

		responsive: {
			rules: [
				{
					condition: {
						maxWidth: 500,
					},
					chartOptions: {
						legend: legendStyle,
					},
				},
			],
		},
		exporting: { enabled: false },
		credits: { enabled: false },
	});

	// add Reinf. stress [MPa] horizontal orange lines
	for (let i = 0; i < analysis_obj.Analysis.sig_s.length; i++) {
		if (analysis_obj.Analysis.A_s[i] !== 0) {
			stress_strain_chart.addSeries({
				xAxis: 2,
				data: [
					[analysis_obj.Analysis.sig_s[i], analysis_obj.Analysis.z_s[i]],
					[0, analysis_obj.Analysis.z_s[i]],
				],
				color: '#ff6622',
				marker: {
					radius: 3,
					symbol: 'circle',
				},
				type: 'scatter',
				showInLegend: false,
				name: 'Reinf. stress [MPa]',
				lineWidth: 1,
				dataLabels: {
					enabled: true,
					formatter: function () {
						if (this.x === 0) return ``;
						else return this.x.toFixed(2);
					},
				},
			});
		}
	}
}

export function plotMcurve(analysis_obj, div_id) {
	let moment_curvature_data = [];

	for (var i = 0; i < analysis_obj.Analysis.Mcurve.kappa.length; i++) {
		moment_curvature_data[i] = [
			analysis_obj.Analysis.Mcurve.kappa[i] * 1000000,
			analysis_obj.Analysis.Mcurve.M[i],
		];
	}

	Highcharts.chart(div_id, {
		title: {
			text: null,
			style: titleFontStyle,
		},

		yAxis: {
			title: {
				text: 'Bending moment [kNm]',
			},
		},

		xAxis: {
			labels: {
				formatter: function () {
					return `${this.value}<i>μ</i>`;
				},
			},
		},

		tooltip: {
			formatter: function () {
				const title = this.series.name.split(' ').slice(0, -1).join(' ');
				const curvature = Rounder(this.x, 2);
				const unit = this.series.name.split(' ').at(-1).slice(1, -1);
				const bending_moment = Rounder(this.y, 2);

				return `Curvature: ${curvature} ${unit} <br> Bending moment: ${bending_moment} kNm`;
			},
			borderRadius: 0,
		},

		legend: legendStyle,

		series: [
			{
				type: 'scatter',
				name: 'Curvature [1/mm]',
				data: moment_curvature_data,
				lineWidth: 1,
				marker: {
					enabled: false,
				},
			},
		],

		responsive: {
			rules: [
				{
					condition: {
						maxWidth: 500,
					},
					chartOptions: {
						legend: legendStyle,
					},
				},
			],
		},
		exporting: { enabled: false },
		credits: { enabled: false },
	});
}

export const drawShearArea = (analysis_object, div_id) => {
	var canvas = document.getElementById(div_id);
	var ctx = canvas.getContext('2d');
	// ctx.clearRect(0, 0, canvas.width, canvas.height);

	// scaling factor
	let Max_dim = Math.max(analysis_object.Geometry.height, analysis_object.Geometry.width);
	let scale = (0.95 * Math.min(canvas.width, canvas.height)) / Max_dim;

	// get center:
	var offset_y = canvas.height / 2;
	var offset_x = canvas.width / 2;

	// background
	// ctx.fillStyle = '#F4F4F4';
	ctx.fillStyle = 'transparent';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// create hatch pattern:

	// create the off-screen canvas
	var canvasPattern = document.createElement('canvas');
	canvasPattern.width = 10;
	canvasPattern.height = 10;
	var contextPattern = canvasPattern.getContext('2d');

	// draw pattern to off-screen context
	contextPattern.beginPath();
	contextPattern.moveTo(0, 0);
	contextPattern.lineTo(10, 10);
	contextPattern.strokeStyle = '#061258';
	contextPattern.stroke();

	// now pattern will work with canvas element
	var hatch = ctx.createPattern(canvasPattern, 'repeat');

	let fill = '#B5B5B5';
	let stroke = '#061258';

	analysis_object.Geometry.Contour.forEach((contour) => {
		let coords = [];
		for (let i = 0; i < contour.x.length; i++) {
			coords.push([contour.x[i] * scale, -contour.y[i] * scale]);
		}
		DrawShape(ctx, coords, offset_y, offset_x, fill, stroke, 2);
	});

	for (let i = 0; i < analysis_object.y_s.length; i++) {
		drawCircle(
			ctx,
			analysis_object.y_s[i] * scale + offset_x,
			-analysis_object.z_s[i] * scale + offset_y,
			(analysis_object.Reinforcement.dia[i] / 2) * scale,
			'#ff6622',
			'#061258',
			0.5
		);
	}

	// draw the shear area
	let ShearCoords = [];
	// let center_x = 0;
	// let center_y = 0;
	analysis_object.shearArea.forEach((node) => {
		ShearCoords.push([node[0] * scale, -node[1] * scale]);
		// center_x += node[0] * scale;
		// center_y += -node[1] * scale;
	});
	// center_x /= ShearArea.length;
	// center_y /= ShearArea.length;

	DrawShape(ctx, ShearCoords, offset_y, offset_x, hatch, stroke, 1);

	// ctx.font = '30px Arial';
	// ctx.fillStyle = 'black';
	// ctx.textAlign = 'center';
	// ctx.fillText('Aw', canvas.width / 2, canvas.height / 2);

	// Draw stirrups
	let stirr_dia = analysis_object.Reinforcement.dia_shear;
	let Stirrups = analysis_object.stirrups;

	stroke = '#ff6622';

	if (analysis_object.ActiveStirrups === false) ctx.setLineDash([30, 15]); // set stirrups dotted if spacing too large!
	let stirrup_line = stirr_dia * scale;
	Stirrups.lines.forEach((line) => {
		drawLine(
			ctx,
			line[0] * scale + offset_x,
			-line[1] * scale + offset_y,
			line[2] * scale + offset_x,
			-line[3] * scale + offset_y,
			stroke,
			stirrup_line
		);
	});

	Stirrups.bends.forEach((bend) => {
		drawArc(
			ctx,
			[
				bend[0] * scale + offset_x,
				-bend[1] * scale + offset_y,
				bend[2] * scale,
				bend[3],
				bend[4],
				bend[5],
			],
			stroke,
			stirrup_line
		);
	});
	ctx.setLineDash([]);
};

// plot on output (paged)
export const cross_section_charts = (obj, div1, div2, div3, div4, div5, div6) => {
	// SLS
	if (obj.SLS_UR_obj !== null) {
		clearCanvas(div2);

		plotStressStrain(obj.SLS_UR_obj, div1);
		createHeatMap(obj.SLS_UR_obj, div2);
		plotMcurve(obj.SLS_UR_obj, div3);
	}

	// ULS
	if (obj.ULS_UR_obj !== null) {
		clearCanvas(div5);

		plotStressStrain(obj.ULS_UR_obj, div4);
		createHeatMap(obj.ULS_UR_obj, div5);
	}

	// ULS_V
	if (obj.ULS_UR_V_obj !== null) {
		clearCanvas(div6);

		drawShearArea(obj.ULS_UR_V_obj, div6);
	}
};

export const getMax = (numbers) => numbers.reduce((a, b) => Math.max(a, b));
export const getMin = (numbers) => numbers.reduce((a, b) => Math.min(a, b));

// generate hex code from value
export function hslToHex(h, s, l) {
	l /= 100;
	const a = (s * Math.min(l, 1 - l)) / 100;
	const f = (n) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

// const scale = {
// 	min: {
// 		value: -20,
// 		hue: 1,
// 	},
// 	max: {
// 		value: 1,
// 		hue: 245,
// 	},
// };

// export function hslToHex(h, s, l) {
// 	l /= 100;
// 	const a = (s * Math.min(l, 1 - l)) / 100;
// 	const f = (n) => {
// 		const k = (n + h / 30) % 12;
// 		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
// 		return Math.round(255 * color)
// 			.toString(16)
// 			.padStart(2, '0');
// 	};
// 	return `#${f(0)}${f(8)}${f(4)}`;
// }

export function temperatureToColor(temp, scale) {
	temp = Math.min(scale.max.value, Math.max(scale.min.value, temp));
	const range = scale.max.value - scale.min.value;
	const hueRange = scale.max.hue - scale.min.hue;
	const value = (temp - scale.min.value) / range;
	const hue = scale.max.hue - hueRange * value;

	return hslToHex(hue, 100, 50);
}

export function DrawShape(ctx, coords, offset_y, offset_x, fill, stroke, strokeWidth) {
	ctx.beginPath();
	for (let i = 0; i < coords.length; i++) {
		if (i === 0) {
			ctx.moveTo(coords[i][0] + offset_x, coords[i][1] + offset_y);
		} else {
			ctx.lineTo(coords[i][0] + offset_x, coords[i][1] + offset_y);
		}
	}
	ctx.closePath();

	if (fill) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	if (stroke) {
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
}

export function drawCircle(ctx, x, y, radius, fill, stroke, strokeWidth) {
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
	if (fill) {
		ctx.fillStyle = fill;
		ctx.fill();
	}
	if (stroke) {
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
}

export function drawArc(ctx, InpArr, stroke, strokeWidth) {
	ctx.beginPath();
	ctx.arc(InpArr[0], InpArr[1], InpArr[2], InpArr[3], InpArr[4], InpArr[5]);
	if (stroke) {
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
}

export function drawLine(ctx, x_0, y_0, x_1, y_1, stroke, strokeWidth) {
	ctx.beginPath();
	ctx.moveTo(x_0, y_0);
	ctx.lineTo(x_1, y_1);
	if (stroke) {
		ctx.lineWidth = strokeWidth;
		ctx.strokeStyle = stroke;
		ctx.stroke();
	}
}

export function clearCanvases(div_one, div_two) {
	var canvas = document.getElementById(div_one);
	var ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	canvas = document.getElementById(div_two);
	ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function clearCanvas(div_one) {
	var canvas = document.getElementById(div_one);
	var ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Helper functions:

export function AddLineBreaks(ArrayOfStrings) {
	let output = '';
	ArrayOfStrings.forEach((str) => {
		output = output + str + '<br>';
	});

	return output;
}

// this function make the blinekr css active for 1 sec, then changes the element's color and cursor to be "active"
export const blinker2 = (element, color) => {
	new Promise((resolve, reject) => {
		setTimeout(() => {
			document.getElementById(element).style.animation = 'blink 1s 2';
		}, 50);
		resolve();
	}).then(() => {
		setTimeout(() => {
			if (color === 'orange') {
				document.getElementById(element).style.animation = '';
				document
					.getElementById(element)
					.setAttribute(
						'style',
						'color: #3434b7  !important; background-color: #ff6622; border-color: #ff6622; pointer-events: auto; cursor: pointer;'
					);
			} else if (color === 'green') {
				document.getElementById(element).style.animation = '';
				document
					.getElementById(element)
					.setAttribute(
						'style',
						'color: #F4F4F4  !important; background-color: #08BE88; border-color: #08BE88; pointer-events: auto; cursor: pointer;'
					);
			}
		}, 1000);
	});
};

export const slideOutTabToggler = (div, enabled, isLeaf = false) => {
	if (enabled) {
		if (isLeaf) {
			document
				.getElementById(div)
				.setAttribute('style', 'background-color: #08BE88; color: #F4F4F4 !important;;');
		} else {
			// make clickable and orange/blue
			document
				.getElementById(div)
				.setAttribute('style', 'background-color: #ff6622; color: #3434b7;');
		}
	} else {
		// make unclickable and grey/white
		document
			.getElementById(div)
			.setAttribute(
				'style',
				'background-color: #B5B5B5; color: #F4F4F4 !important; pointer-events: none;'
			);
	}
};

export const blinker = () => {
	document.getElementById('slideOutTab_cross_section_results').style.animation = 'blink 1s 2';
	document.getElementById('slideOutTab_cross_section_graphs').style.animation = 'blink 1s 2';
};

export const makeButtonsReady = () => {
	document.getElementById('slideOutTab_cross_section_results').style.backgroundColor = '#ff6622';
	document.getElementById('slideOutTab_cross_section_graphs').style.backgroundColor = '#ff6622';

	document.getElementById('slideOutTab_cross_section_results').children[0].style.color = '#3434b7';
	document.getElementById('slideOutTab_cross_section_graphs').children[0].style.color = '#3434b7';

	document.getElementById('slideOutTab_cross_section_results').style.pointerEvents = 'all';
	document.getElementById('slideOutTab_cross_section_graphs').style.pointerEvents = 'all';
};

// PLOT STYLING:

const titleFontStyle = {
	fontFamily: 'ApercuMono, sans-serif',
	size: 20,
	color: '#ff6622',
};

// 123
export const drawDiagram = () => {
	var canvas = document.getElementById('test_space');
	var ctx = canvas.getContext('2d');

	// scaling factor
	const Max_dim = Math.max(
		isNaN(height) ? -Infinity : height,
		isNaN(width) ? -Infinity : width,
		isNaN(radius) ? -Infinity : radius
	);
	const scale = (0.75 * Math.min(canvas.width, canvas.height)) / Max_dim;

	// get center:
	var offset_y = canvas.height / 2;
	var offset_x = canvas.width / 2;

	ctx.fillStyle = '#F4F4F4';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// contour = [{
	//     x: [-250, 250, 250, 100, 100, -100, -100, -250, -250],
	//     y: [250, 250, 50, 50, -250, -250, 50, 50, 250]
	// }]

	let fill = '#B5B5B5';
	let stroke = '#061258';

	contour = makeContour();
	contour.forEach((cont) => {
		let coords = [];
		for (let i = 0; i < cont.x.length; i++) {
			coords.push([cont.x[i] * scale, -cont.y[i] * scale]);
		}
		DrawShape(ctx, coords, offset_y, offset_x, fill, stroke, 2);
	});

	y_s = makeArrs().y_s;
	z_s = makeArrs().z_s;
	dia = makeArrs().dia;
};

export const drawLineWithCrosses = (draw, xstart, xend, ystart, yend, length, isHorizontal) => {
	const stroke_settings = { color: '#232323', width: 2, linecap: 'round', linejoin: 'round' };
	let cross_arr;
	const margin = 30;

	if (isHorizontal) {
		cross_arr = [0, 0, -6, 6, 0, 0, 0, -6, 0, 0, 0, 6, 0, 0, 6, -6];

		// crosses
		draw
			.polyline(cross_arr)
			.stroke(stroke_settings)
			.cx(xstart)
			.cy(ystart - 30);
		draw
			.polyline(cross_arr)
			.stroke(stroke_settings)
			.cx(xend)
			.cy(ystart - 30);
		// line
		draw.polyline([xstart, ystart - margin, xend, ystart - margin]).stroke(stroke_settings);

		var text = draw.text(function (add) {
			add.tspan(`b = ${length}`);
		});
		text.dmove((xstart + xend) / 2 - margin, ystart - margin * 2);
	} else {
		cross_arr = [0, 0, -6, 0, 0, 0, -6, -6, 0, 0, 6, 0, 0, 0, 6, 6];

		// crosses
		draw
			.polyline(cross_arr)
			.stroke(stroke_settings)
			.cx(xstart - margin)
			.cy(ystart);
		draw
			.polyline(cross_arr)
			.stroke(stroke_settings)
			.cx(xstart - margin)
			.cy(yend);

		// line
		draw.polyline([xstart - margin, ystart, xstart - margin, yend]).stroke(stroke_settings);

		// text
		var text = draw.text(function (add) {
			add.tspan(`h = ${length}`);
		});
		text.dmove(xstart - 90, (ystart + yend) / 2).rotate(-90);
	}
};

// let addSteel = (draw, steel_dia_top, steel_spacing_top, cover_layer_top, steel_dia_bot, steel_spacing_bot, cover_layer_bot) => {
export const addSteel = (draw) => {
	steel_dia_top = 10;

	draw.circle(steel_dia_top).fill('#71797E').dmove(200, 200);
};

export const makeContour = () => {
	let contour = [];
	if (geometry_type === 'rectangular') {
		let ref_z = height / 2;
		let ref_y = width / 2;
		contour.push({
			x: [-ref_y, ref_y, ref_y, -ref_y, -ref_y],
			y: [-ref_z, -ref_z, ref_z, ref_z, -ref_z],
		});
	}
	if (geometry_type === 't_section') {
		let offset_web_y = 0;
		contour.push({
			x: [
				-(width / 2),
				width / 2,
				width / 2,
				web_thickness / 2 + offset_web_y,
				web_thickness / 2 + offset_web_y,
				-(web_thickness / 2) + offset_web_y,
				-(web_thickness / 2) + offset_web_y,
				-(width / 2),
				-(width / 2),
			],
			y: [
				height / 2,
				height / 2,
				height / 2 - flange_thickness,
				height / 2 - flange_thickness,
				-(height / 2),
				-(height / 2),
				height / 2 - flange_thickness,
				height / 2 - flange_thickness,
				height / 2,
			],
		});
	}
	if (geometry_type === 'circular') {
		const div_theta = 48;
		let contour_x = [];
		let contour_y = [];
		let d_theta = (2 * Math.PI) / div_theta;
		for (let i = 0; i <= div_theta - 1; i++) {
			let theta = i * d_theta;
			contour_x.push(radius * Math.cos(theta));
			contour_y.push(radius * Math.sin(theta));
		}
		contour_x.push(contour_x[0]);
		contour_y.push(contour_y[0]);
		contour.push({
			x: contour_x,
			y: contour_y,
		});
	}
	return contour;
};

export const makeArrs = () => {
	// let arrays = {
	//     y_s: [],
	//     z_s: [],
	//     dia: [],
	// }

	y_s = [];
	const nlayers_top = 1; // set higher at some point
	const nlayers_bot = 1; // set higher at some point

	const n_bar_top = [number_of_bars_top];
	const n_bar_bot = [number_of_bars_bottom];

	console.log('n_bar_top:', n_bar_top);
	console.log('n_bar_bot:', n_bar_bot);
	console.log('cover_layer_top:', cover_layer_top);

	if (geometry_type === 'rectangular') {
	}
	if (geometry_type === 't_section') {
		let space = 0;

		for (let i = 0; i <= nlayers_top - 1; i++) {
			// if (Input.n_bar_top[i] > 1) {
			//     var w_local = Math.max(0, width - 2 * cover_layer_top - Input.bar_dia_top[i]);
			//     space = w_local / (Input.n_bar_top[i] - 1);
			//     if (space === 0) space = w_local / 2;
			// } else {
			//     var w_local = 0;
			//     space = width / 2;
			// }
			// for (let j = 0; j <= n_bar_top[i] - 1; j++) {
			//     y_s.push(-w_local / 2 + j * space)
			// }
		}
	}

	if (geometry_type === 'circular') {
	}

	return y_s;
};

export function linkWrapper(link) {
	return `<a target="_blank" href="${link}">${link}</a>`;
}

// only a regex this functions makes fx 'subbase_name' into 'Subbase Name'
// or 'long_term_compressive_strength' into 'Long-Term Compressive Strength'
// or 'modulus_of_subgrade' into Modulus of Subgrade'
let makeLabelTextFromInputField = (inputField) => {
	let labelText = '';
	const arr = inputField.split('_');

	for (let i = 0; i < arr.length; i++) {
		if (arr[i] === 'of') {
			labelText += 'of ';
			continue;
		}
		if (arr[i] === 'long') {
			labelText += 'Long-';
			continue;
		}
		labelText += arr[i].charAt(0).toUpperCase() + arr[i].slice(1) + ' ';
	}
	return labelText;
};

// inputField fucntions
export function createNumberInputWithTabIndex(
	inputField,
	latex,
	val,
	unit,
	tabindex,
	analyzer,
	disabled = false
) {
	const labelText = makeLabelTextFromInputField(inputField);

	let div = document.createElement('div');
	div.setAttribute('class', 'col-6 mb-2');
	div.setAttribute('id', `div_${inputField}`);
	let p = document.createElement('p');
	p.setAttribute('class', 'formlabel');
	p.textContent = labelText;
	div.appendChild(p);

	let input_group = document.createElement('div');
	input_group.setAttribute('class', 'input-group');

	let input_group_prepend = document.createElement('div');
	input_group_prepend.setAttribute('class', 'input-group-prepend');

	let input_group_text = document.createElement('div');
	input_group_text.setAttribute('class', 'input-group-text justify-content-center');
	input_group_text.textContent = `$$ ${latex} = $$`;

	input_group_prepend.appendChild(input_group_text);
	input_group.appendChild(input_group_prepend);
	div.appendChild(input_group);

	let input_field = document.createElement('input');
	input_field.setAttribute('class', 'form-control');
	input_field.setAttribute('type', 'number');
	input_field.setAttribute('placeholder', `Please enter ${labelText}`);
	input_field.setAttribute('id', inputField);
	input_field.setAttribute('name', inputField);
	input_field.addEventListener('input', () => analyzer(false));
	input_field.setAttribute('tabindex', tabindex);
	if (disabled) {
		input_field.setAttribute('disabled', disabled);
	}
	if (val !== 0) input_field.value = val;

	input_group.appendChild(input_field);

	let input_group_append = document.createElement('div');
	input_group_append.setAttribute('class', 'input-group-append');
	let input_group_append_text = document.createElement('span');
	input_group_append_text.setAttribute('class', 'input-group-text');
	input_group_append_text.textContent = unit;
	input_group_append.appendChild(input_group_append_text);
	input_group.appendChild(input_group_append);

	return div;
}

export function createSelectDiv(
	inputField,
	faIcon,
	optionsArray,
	withData,
	val,
	controller,
	tabindex,
	analyzer
) {
	// Drop-down
	const labelText = makeLabelTextFromInputField(inputField);

	let div = document.createElement('div');
	div.setAttribute('class', 'col-6 mb-2');
	div.setAttribute('id', `div_${inputField}`);
	let p = document.createElement('p');
	p.setAttribute('class', 'formlabel');
	p.textContent = labelText;
	div.appendChild(p);

	let input_group = document.createElement('div');
	input_group.setAttribute('class', 'input-group');

	let input_group_prepend = document.createElement('div');
	input_group_prepend.setAttribute('class', 'input-group-prepend');

	let input_group_text = document.createElement('div');
	input_group_text.setAttribute('class', 'input-group-text justify-content-center');

	let fa_icon = document.createElement('i');
	fa_icon.setAttribute('class', faIcon);

	input_group_text.appendChild(fa_icon);
	input_group_prepend.appendChild(input_group_text);
	input_group.appendChild(input_group_prepend);

	let input_field = document.createElement('select');
	input_field.setAttribute('class', 'form-control');
	input_field.setAttribute('id', inputField);
	input_field.setAttribute('name', inputField);
	input_field.setAttribute('tabindex', tabindex);
	for (var o = 0; o < optionsArray.length; o++) {
		var option = document.createElement('option');
		option.value = optionsArray[o];
		option.text = optionsArray[o];
		input_field.appendChild(option);
	}
	if (withData) input_field.value = val;

	input_field.addEventListener('input', () => {
		controller();
		analyzer(false);
	});

	input_group.appendChild(input_field);
	div.appendChild(input_group);
	return div;
}

export function createSelectInputNoControllerNoNumberTabIndex(
	inputField,
	faIcon,
	optionsArray,
	analyzer,
	withData,
	val,
	tabindex
) {
	const labelText = makeLabelTextFromInputField(inputField);

	let div = document.createElement('div');
	div.setAttribute('class', 'col');
	let p = document.createElement('p');
	p.setAttribute('class', 'formlabel mb-2');
	p.textContent = labelText;
	div.appendChild(p);

	let input_group = document.createElement('div');
	input_group.setAttribute('class', 'input-group');

	let input_group_prepend = document.createElement('div');
	input_group_prepend.setAttribute('class', 'input-group-prepend');

	let input_group_text = document.createElement('div');
	input_group_text.setAttribute('class', 'input-group-text justify-content-center');
	// input_group_text.textContent = `$$ ${faIcon} = $$`

	let input_icon = document.createElement('i');
	input_icon.setAttribute('class', faIcon);
	input_group_text.appendChild(input_icon);

	input_group_prepend.appendChild(input_group_text);
	input_group.appendChild(input_group_prepend);
	div.appendChild(input_group);

	let input_field = document.createElement('select');
	input_field.setAttribute('class', 'form-control');
	input_field.setAttribute('name', `${inputField}`);
	input_field.setAttribute('id', `${inputField}`);
	input_field.setAttribute('tabindex', tabindex);
	for (var o = 0; o < optionsArray.length; o++) {
		var option = document.createElement('option');
		option.value = optionsArray[o];
		option.text = optionsArray[o];
		input_field.appendChild(option);
	}
	input_field.addEventListener('input', () => {
		analyzer(false);
	});
	if (withData) input_field.value = val;

	input_group.appendChild(input_field);

	return div;
}
