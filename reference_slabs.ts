import { generalLoad, Slab_Analysis, subbase, slabParameters, slab } from './slab_analysis.js';
import * as materials from '../classes/materials.js';
import { Reinforcement } from '../classes/Reinforcement.js';

export function referenceSlab(
	// library of reference slabs for design comparison
	cradleToGrave: boolean,
	loadArray: generalLoad[],
	subbase: subbase,
	parameters: slabParameters
) {
	let refSlabName = 'No suitable comparison found';
	let refCO2 = 999;

	let para = { ...parameters };
	para.Code = 'TR34';

	let slabLib: { t: number; fck: number; dia: number; s: number }[] = [];
	slabLib.push({ t: 100, fck: 25, dia: 6, s: 150 });
	slabLib.push({ t: 120, fck: 30, dia: 8, s: 150 });
	slabLib.push({ t: 150, fck: 35, dia: 8, s: 150 });
	slabLib.push({ t: 180, fck: 35, dia: 10, s: 150 });
	slabLib.push({ t: 200, fck: 35, dia: 10, s: 150 });
	slabLib.push({ t: 220, fck: 40, dia: 12, s: 150 });
	slabLib.push({ t: 250, fck: 40, dia: 16, s: 150 });
	slabLib.push({ t: 350, fck: 40, dia: 16, s: 150 });

	slabLib.every((slab) => {
		var refSlab = genSimpleSlab(
			slab.t,
			slab.fck,
			{ dia: slab.dia, spacing: slab.s },
			subbase,
			parameters
		);
		let results = refSlab.verifyLoads(loadArray, false);

		if (results.worst_UR.any <= 1) {
			refSlabName = `${slab.t}mm C${slab.fck}, Y${slab.dia}/${slab.s} in both sides`;
			refCO2 = refSlab.CO2(cradleToGrave, false).emmision_per_m2;

			return false;
		}

		return true;
	});

	return {
		name: refSlabName,
		CO2: refCO2, // CO2-eq per sq. meter
	};
}

export function genSimpleSlab(
	thickness: number,
	concreteClass: number,
	reinforcement: { dia: number; spacing: number },
	subbase: subbase,
	parameters: slabParameters
) {
	// general a simple slab class from reduces number of inputs
	const Concrete = new materials.EC_Concrete(concreteClass);
	const Reinf_Material = new materials.Steel(500, 'B', true);
	const Fibres = new materials.DURUS_EasyFinish('0', 'EC'); // argument: content [kg/m3]

	const slab: slab = {
		thickness: thickness,
		width: 6,
		length: 6,
		Concrete: Concrete,
		// joint details:
		withJoints: false,
		field_width: 6,
		field_length: 6,
		joints: {
			type: 'Saw Cut',
			cutDepth: 1 / 3,
		},
	};

	let cover = 25;
	if (concreteClass >= 35) cover = 35;
	if (concreteClass >= 40) cover = 45;

	const localRef = {
		top_dia: reinforcement.dia,
		top_spacing: reinforcement.spacing,
		top_cover: cover,

		mid_dia: reinforcement.dia,
		mid_spacing: reinforcement.spacing,

		bot_dia: reinforcement.dia,
		bot_spacing: reinforcement.spacing,
		bot_cover: cover,
	};

	const slabReinf = {
		//fibers:
		fibers: Fibres,
		//conventional:
		steel: Reinf_Material,
		internal: localRef,
		edge: localRef,
		corner: localRef,
	};

	return new Slab_Analysis(slab, subbase, slabReinf, parameters);
}
