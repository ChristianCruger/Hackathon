import { Slab_Analysis } from './slab_analysis';
import { subbase } from './subbase';
import * as materials from './materials';

// interface file to communicate between UI index.html and slab_analysis code

window.analyse = (
	fck = 30,
	thick = 120,
	fiber = '3',
	dia_top = 0,
	dia_bot = 0,
	insulation = 'Sundolitt S60',
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

	let ins_quality = insulation.split('Sundolitt S')[1];
	let sigma;
	let lambda;
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
			sigma = 18;
	}

	const subbase_input = [
		{
			name: 'Insulation',
			type: 'Longterm comp',
			value: sigma,
			thickness: ins_thick,
			lambda: lambda,
			insulation_type: insulation,
		},
	];

	const subbases = subbase(subbase_input, 1);

	const analysisParameters = {
		Code: 'EN1992',
		NationalAnnex: '',
		crack_limit: 0.3,
	};

	// Assemble load array:
	// test - one of each:
	const loads = [
		{
			name: 'Test UDL',
			type: 'uniform',
			P: 11.25,
			PunchingLoad: '',
			position: 'any',
		},
		{
			name: 'Test point load',
			type: 'single',
			P: 10.5,
			PunchingLoad: 0,
			footprint: {
				shape: 'round',
				r: 100,
			},
			eq_radius: 0,
			position: 'any',
			trueEdge: true,
			dist_w: 0,
			dist_l: 0,
		},
	];

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

	console.timeEnd('runTime');
};

const Round = (number, digits = 2) =>
	Math.round((number + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);
