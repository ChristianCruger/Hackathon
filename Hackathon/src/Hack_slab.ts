import { Slab_Analysis } from './slab_analysis';
import { subbase } from './subbase';
import * as materials from './materials';
import Insulation from './Insulation';
import './style.css';

// interface file to communicate between UI index.html and slab_analysis code

export const analyse = (
	fck = 30,
	thick = 120,
	fiber = '3',
	dia_top = 0,
	dia_bot = 0,
	insulationString = 'Sundolitt S60',
	ins_thick = 400
) => {
	console.log('Analysing slab...');
	console.time('runTime');

	// Optimization variables:

	// Assemble input objects:

	const slab = {
		thickness: thick,
		width: 6000,
		length: 6000,
		Concrete: new materials.EC_Concrete(fck, '', 'parabolic', 'R', 50),
		// joint details:
		withJoints: false,
		joints: {},
	};

	let reinf = {
		top_dia: dia_top,
		top_spacing: 150,
		top_cover: 25,

		mid_dia: 0,
		mid_spacing: 150,

		bot_dia: dia_bot,
		bot_spacing: 150,
		bot_cover: 25,
	};

	const reinforcement = {
		//fibers:
		fibers: new materials.DURUS_EasyFinish(fiber, 'EC'),
		//conventional:
		steel: new materials.Steel(500, 'B', true),
		internal: reinf,
		edge: reinf,
		corner: reinf,
	};

	let sigma: number;
	let lambda: number;

	if (insulationString.includes('S')) {
		let ins_quality = insulationString.split('S')[1];
		switch (ins_quality) {
			case '60':
				sigma = 18;
				lambda = 0.041;
				break;
			case '70':
				sigma = 21;
				lambda = 0.04;
				break;
			case '80':
				sigma = 24;
				lambda = 0.038;
				break;
			case '100':
				sigma = 30;
				lambda = 0.037;
				break;
			case '150':
				sigma = 45;
				lambda = 0.034;
				break;
			default:
				sigma = 0;
				lambda = 0.001;
				console.warn('insulation type not found');
		}
	} else {
		let ins_quality = insulationString.split('C')[1];
		switch (ins_quality) {
			case '60':
				sigma = 18;
				lambda = 0.033;
				break;
			case '80':
				sigma = 24;
				lambda = 0.031;
				break;
			default:
				sigma = 0;
				lambda = 0.001;
				console.warn('insulation type not found');
		}
	}

	const subbase_input = [
		{
			name: 'Insulation' as const,
			type: 'Longterm comp' as const,
			value: sigma,
			thickness: ins_thick,
			lambda: lambda,
			insulation_type: 'Sundolitt ' + insulationString,
		},
	];

	const subbases = subbase(subbase_input, 1);

	const analysisParameters = {
		Code: 'TR34' as const,
		NationalAnnex: '',
		crack_limit: 0.3,
	};

	// Assemble load array:
	// test - one of each:
	const loads = [
		{
			name: 'Test UDL',
			type: 'uniform' as const,
			P: 11.25,
			PunchingLoad: 0,
			position: 'any' as const,
		},
		{
			name: 'Test point load',
			type: 'single' as const,
			P: 10.5,
			PunchingLoad: 0,
			footprint: {
				shape: 'round' as const,
				r: 100,
			},
			eq_radius: 0,
			position: 'any' as const,
			trueEdge: true,
			dist_w: 0,
			dist_l: 0,
		},
	] as any;

	const analysis = new Slab_Analysis(slab, subbases, reinforcement, analysisParameters);
	const results = analysis.verifyLoads(loads);
	console.log(results);

	let okSTR = '	-	OK!';
	if (Round(results.worst_UR.any * 100, 1) > 100) okSTR = '	-	NOT OK!';
	document.getElementById('output1').innerHTML =
		'Slab Utilization: ' + Round(results.worst_UR.any * 100, 1) + '%' + okSTR;

	const emissions = analysis.CO2();
	document.getElementById('output2').innerHTML =
		'Total Global warming potential: ' + Round(emissions.emmision_per_m2, 1) + 'kg/m2';

	const insulation = Insulation(thick, subbase_input);

	let insulationOutput = 'Insulation: U-value = ' + Round(insulation.Uvalue, 1);

	const Ulimit = 0.1;

	if (insulation.Uvalue <= Ulimit) {
		insulationOutput += ' < U-limit ( = 0.1 ) -> OK! ';
	} else {
		insulationOutput += ' > U-limit ( = 0.1 ) -> NOT OK! ';
	}
	document.getElementById('output3').innerHTML = insulationOutput;

	console.timeEnd('runTime');
	return {
		results,
		utilization: results.worst_UR.any,
		emissions: emissions.emmision_per_m2,
		Uvalue: insulation.Uvalue,
	};
};

const Round = (number, digits = 2) =>
	Math.round((number + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);
