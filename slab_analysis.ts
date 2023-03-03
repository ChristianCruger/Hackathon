import docWriter from '../classes/DocWriter.js';
import EC_CS from '../classes/creep_shrinkage.js';
import { CrossSectionAnalysis } from '../cross_section_analysis/CrossSection_Analysis.js';
import { Steel, EC_Concrete, structural_fibers } from '../classes/materials.js';
import { Reinforcement } from '../classes/Reinforcement.js';
import { Rectangular } from '../classes/SectionTypes.js';
import { Round, hslToHex, ucfirst } from '../classes/helper_functions.js';
import { referenceSlab } from './reference_slabs.js';

export class Slab_Analysis {
	slab: slab;
	subbase: subbase;
	reinforcement: slabReinforcement;
	parameters: slabParameters;
	l: number;
	lambda: number;
	gamma: {
		cc: number;
		ct: number;
		s: number;
		f: number;
		v: number;
	};

	l_edge: number;

	#testetLoads: generalLoad[];

	Mn_storage: {
		internal: { value: number; doc: docWriter };
		edge: { value: number; doc: docWriter };
		corner: { value: number; doc: docWriter };
	};
	Mp_storage: {
		internal: { value: number; doc: docWriter };
		edge: { value: number; doc: docWriter };
		corner: { value: number; doc: docWriter };
	};

	riskOfCracking: boolean;

	#dowels: {
		dia: number;
		spacing: number;
		P: number;
		steelClass: number;
		capacityDoc: docWriter;
	};

	constructor(
		slab: slab,
		subbase: subbase,
		reinforcement: slabReinforcement,
		parameters: slabParameters
	) {
		// save input parameters
		this.slab = slab;
		this.subbase = subbase;
		this.reinforcement = reinforcement;

		['internal', 'edge', 'corner'].forEach((pos) => {
			if (this.reinforcement[pos].bot_spacing < this.reinforcement[pos].bot_dia)
				this.reinforcement[pos].bot_spacing = this.reinforcement[pos].bot_dia;
			if (this.reinforcement[pos].top_spacing < this.reinforcement[pos].top_dia)
				this.reinforcement[pos].top_spacing = this.reinforcement[pos].top_dia;
			if (this.reinforcement[pos].mid_spacing < this.reinforcement[pos].mid_dia)
				this.reinforcement[pos].mid_spacing = this.reinforcement[pos].mid_dia;
		});

		let hasInternalReinf =
			this.reinforcement.internal.top_dia +
				this.reinforcement.internal.mid_dia +
				this.reinforcement.internal.bot_dia >
			0;
		let hasEdgeReinf =
			this.reinforcement.edge.top_dia +
				this.reinforcement.edge.mid_dia +
				this.reinforcement.edge.bot_dia >
			0;
		let hasCornerReinf =
			this.reinforcement.corner.top_dia +
				this.reinforcement.corner.mid_dia +
				this.reinforcement.corner.bot_dia >
			0;

		if (hasInternalReinf && !hasEdgeReinf) {
			this.reinforcement.edge = this.reinforcement.internal;
			hasEdgeReinf = true;
		}

		if (hasEdgeReinf && !hasCornerReinf) {
			this.reinforcement.corner = this.reinforcement.edge;
			hasCornerReinf = true;
		}

		this.parameters = parameters;

		// geometrical factor KG for slabs:
		this.reinforcement.fibers.kG = 1.5;

		let Ecm = slab.Concrete.Ec_eff as number;
		let k = subbase.k;
		let t = slab.thickness;
		let poisson = slab.Concrete.poisson as number;

		this.l = Math.pow((Ecm * Math.pow(t, 3)) / (12 * (1 - poisson) * k), 0.25); // [mm]

		this.lambda = Math.pow((3 * k) / (Ecm * Math.pow(t, 3)), 0.25); // [1/mm]

		this.l_edge = Round(Math.sqrt(4.3) * this.l + 500, 0); // distance from edges for reinforcement

		this.gamma = {
			// get this from DB instead!
			cc: 1.5,
			ct: 1.5,
			s: 1.15,
			f: 1.5,
			v: 1.4,
		};
		if (this.parameters.NationalAnnex === 'DK NA') {
			this.gamma.cc = 1.45;
			this.gamma.ct = 1.7;
			this.gamma.s = 1.2;
		}
		this.#testetLoads = [];

		this.Mn_storage = {
			internal: { value: 0, doc: undefined },
			edge: { value: 0, doc: undefined },
			corner: { value: 0, doc: undefined },
		};
		this.Mp_storage = {
			internal: { value: 0, doc: undefined },
			edge: { value: 0, doc: undefined },
			corner: { value: 0, doc: undefined },
		};

		// dowels : TODO: implement dowel input
		this.dowels = {
			dia: 0,
			spacing: 400,
			steelClass: 235,
		};
		// console.warn('Dowels are not implemented yet!', this.dowels);
	}

	set dowels(input: { dia: number; spacing: number; steelClass: number }) {
		this.#dowels = {
			dia: input.dia,
			spacing: input.spacing || 400,
			P: 0,
			capacityDoc: undefined,
			steelClass: input.steelClass || 235,
		};
		this.#dowelCapacity();
	}

	get dowels() {
		return this.#dowels;
	}

	get geometryDoc() {
		let doc = new docWriter();
		doc.allignChildren = ['left', 'right', 'right', 'left'];
		doc.writeTitleTwo('Slab geometry');
		doc.write(['Thickness:', '\\( t = \\)', this.slab.thickness, 'mm']);
		doc.write(['Width:', '\\( w = \\)', this.slab.width, 'mm']);
		doc.write(['Length:', '\\( l = \\)', this.slab.length, 'mm']);

		if (this.slab.withJoints) {
			doc.write(`Joint type: ${this.slab.joints.type}`, 'strong');
			doc.write(['Field size width:', '\\( w_{f} = \\)', this.slab.field_width, 'mm']);
			doc.write(['Field size length:', '\\( l_{f} = \\)', this.slab.field_length, 'mm']);

			if (this.#dowels.dia > 0) {
				doc.lineBreak();
				doc.write('Joint with dowels', 'strong');
				doc.write(['Dowel diameter:', '\\( ø_{d} = \\)', this.#dowels.dia, 'mm']);
				doc.write(['Dowel spacing:', '\\( s_{d} = \\)', this.#dowels.spacing, 'mm']);
				doc.write(['Dowel steel class:', '\\( f_{yk,d} = \\)', this.#dowels.steelClass, 'MPa']);
			}
		} else {
			doc.write('Jointless slab');
		}

		let geoCheck = this.checkGeometry();
		doc.concat(geoCheck);

		doc.lineBreak();

		doc.writeTitle('Concrete');

		doc.allignChildren = ['left', 'center'];

		doc.write(this.slab.Concrete.documentation());

		doc.concat(this.reinforcementDoc);
		return doc;
	}

	get reinforcementDoc() {
		let doc = new docWriter();
		doc.writeTitle('Reinforcement');
		doc.allignChildren = ['left', 'center'];
		doc.write(this.reinforcement.fibers.documentation(this.parameters.Code === 'EN1992'));

		const inc_steel = <HTMLInputElement>document.getElementById('include_steel_reinforcement');

		if (inc_steel.checked) {
			doc.writeTitle('Steel');
			doc.write(this.reinforcement.steel.documentation());
		}

		// doc.rowWidth = 5;
		// doc.allignChildren = ['left'];

		// let possible_positions = ['internal', 'edge', 'corner'];

		doc.rowWidth = [8, 8, 8, 8, 8, 8, 8];
		doc.allignChildren = ['left', 'right', 'center', 'center', 'right', 'center', 'center'];

		['internal', 'edge', 'corner'].forEach((pos) => {
			let strArr: string[] = [];
			// strArr.push(pos);

			if (this.reinforcement[pos].top_dia > 0) {
				strArr.push(
					`${pos.charAt(0).toUpperCase() + pos.slice(1)} - Top: Y${
						this.reinforcement[pos].top_dia
					}/${this.reinforcement[pos].top_spacing}, \\( c = \\) ${
						this.reinforcement[pos].top_cover
					} mm`
				);
				// strArr.push(` cov = ${this.reinforcement[pos].top_cover} mm`);
			}

			if (this.reinforcement[pos].mid_dia > 0) {
				strArr.push(
					`${pos.charAt(0).toUpperCase() + pos.slice(1)} - Middle: Y${
						this.reinforcement[pos].mid_dia
					}/${this.reinforcement[pos].mid_spacing}`
				);
			}

			if (this.reinforcement[pos].bot_dia > 0) {
				strArr.push(
					`${pos.charAt(0).toUpperCase() + pos.slice(1)} - Bottom: Y${
						this.reinforcement[pos].bot_dia
					}/${this.reinforcement[pos].bot_spacing}, \\( c = \\) ${
						this.reinforcement[pos].bot_cover
					} mm`
				);
			}
			doc.write(strArr);
		});

		return doc;
	}

	get stiffnessDoc() {
		let doc = new docWriter();
		doc.writeTitleTwo('Global stiffness parameters', false);

		doc.rowWidth = [25, 20, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		doc.write([
			'Radius of relative stiffness:',
			'$$ l = \\sqrt[4]{\\frac{ E_{cm} h^{3} }{ k \\ \\left(12 (1 - \\nu^{2})  \\right)}} = $$',
			Round(this.l),
			'mm',
		]);
		doc.write([
			'Characteristic length:',
			'$$ \\lambda^{-1} = \\left( \\frac{ 3 k }{ E_{cm} h^{3} } \\right)^{-1/4} = $$',
			Round(1 / this.lambda),
			'mm',
		]);
		return doc;
	}
	CO2(cradleToGrave = false, makeComparison = false) {
		// CO2 calcs
		let totalArea = ((this.slab.length / 1000) * this.slab.width) / 1000;
		let thick = this.slab.thickness / 1000;
		let slabVolume = totalArea * thick;

		let doc = new docWriter();
		doc.childClass = 'CO2_col';

		let level = 1;
		if (cradleToGrave) level = 2;

		let concreteCO2 = this.slab.Concrete.CO2(1, level);
		let fiberCO2 = this.reinforcement.fibers.CO2(1, level);

		let cradleString = '(cradle-to-gate)';
		if (cradleToGrave) cradleString = '(cradle-to-grave)';
		// doc.writeHeader('CO₂ calcutions: ' + cradleString);
		doc.writeTitleTwo(`CO₂ calculations ${cradleString}`);

		doc.allignChildren = ['left', 'left', 'right', 'left'];
		doc.writeTitle('Materials');
		doc.write([
			'Concrete:',
			this.slab.Concrete.name + ' Class ' + this.slab.Concrete.class,
			Round(concreteCO2, 2),
			'kg CO₂-eq/m³',
		]);
		// doc.write(`(link: ${this.slab.Concrete.EPD_link})`);

		// let fiberString = '';
		if (this.reinforcement.fibers.content > 0) {
			doc.write([
				'Fibers',
				this.reinforcement.fibers.contentString,
				Round(fiberCO2, 2),
				'kg CO₂-eq/m³',
			]);
			// doc.write(`(link: ${this.reinforcement.fibers.EPD_link})`);

			// fiberString = ' with ' + this.reinforcement.fibers.contentString;
		}

		let densitySteel = this.reinforcement.steel.dens;

		let edgeDist = Round(this.l_edge / 1000, 2);

		let area = {} as { corner: number; edge: number; internal: number };
		area['corner'] = 4 * edgeDist * edgeDist;

		area['edge'] =
			2 *
			(edgeDist * (this.slab.length / 1000 - 2 * edgeDist) +
				edgeDist * (this.slab.width / 1000 - 2 * edgeDist));
		area['internal'] = totalArea - area['corner'] - area['edge'];

		let possible_positions: position[] = ['internal', 'edge', 'corner'];

		let steelVol = {} as { corner: number; edge: number; internal: number };
		let totalSteel = 0;

		possible_positions.forEach((location) => {
			let local_reinf = this.reinforcement[location] as localReinforcement;

			let bot_dia = local_reinf.bot_dia;
			let bot_spacing = local_reinf.bot_spacing;
			let mid_dia = local_reinf.mid_dia;
			let mid_spacing = local_reinf.mid_spacing;
			let top_dia = local_reinf.bot_dia;
			let top_spacing = local_reinf.bot_spacing;

			let steelArea =
				(Math.pow(bot_dia / 1000, 2) * (Math.PI / 4) * 1000) / bot_spacing +
				(Math.pow(top_dia / 1000, 2) * (Math.PI / 4) * 1000) / top_spacing +
				(Math.pow(mid_dia / 1000, 2) * (Math.PI / 4) * 1000) / mid_spacing;
			steelArea = 2 * steelArea; // Same in x- and y- direction: multplied by 2

			steelVol[location] = steelArea * area[location];
			totalSteel += steelVol[location];
		});

		let steelCO2 = this.reinforcement.steel.CO2(1, level);
		if (totalSteel > 0) {
			doc.write('');
			doc.write([
				`Reinforcement:`,
				`${this.reinforcement.steel.name} steel`,
				steelCO2,
				'kg CO₂-eq/tonne',
			]);
		}

		if (this.subbase.insulation_layers.length > 0) {
			this.subbase.insulation_layers.forEach((layer) => {
				let Insu_CO2 = layer.EDP_A1A3 * layer.factor;
				if (cradleToGrave) Insu_CO2 = layer.EPD_A1D * layer.factor;

				doc.write([
					`Insulation:`,
					`${layer.name}`,
					Round((Insu_CO2 * 1000) / layer.thickness, 2),
					'kg CO₂-eq/m³',
				]);
			});
		}

		// doc.lineBreak();
		doc.writeTitle('Emissions per square meter');
		doc.rowWidth = [15, 30, 10];
		doc.allignChildren = ['left', 'right', 'right', 'left', 'right', 'left'];
		doc.write([
			'Slab:',
			`${this.slab.thickness}mm ${this.slab.Concrete.name} concrete`,
			Round(this.slab.Concrete.CO2(thick, level), 2),
			'kg CO₂-eq/m²',
		]);

		if (this.reinforcement.fibers.content > 0) {
			doc.write([
				'Fiber reinforcement:',
				this.reinforcement.fibers.contentString + ` in ${this.slab.thickness}mm of concrete`,
				Round(this.reinforcement.fibers.CO2(thick, level), 2),
				'kg CO₂-eq/m²',
			]);
		}

		possible_positions.forEach((location) => {
			let str: string = location;
			if (location === 'internal') str = 'Main';

			let steelMass = (steelVol[location] / area[location]) * densitySteel;
			doc.write([
				`${ucfirst(str)} reinforcement:`,
				Round(steelMass, 2) + ' kg steel/m²',
				Round(this.reinforcement.steel.CO2(steelMass / 1000, level), 2),
				'kg CO₂-eq/m²',
			]);

			// doc.write(`(link: ${this.reinforcement.steel.EPD_link})`);
		});

		let Insu_CO2_total = 0;
		if (this.subbase.insulation_layers.length > 0) {
			this.subbase.insulation_layers.forEach((layer) => {
				let Insu_CO2 = layer.EDP_A1A3 * layer.factor;
				if (cradleToGrave) Insu_CO2 = layer.EPD_A1D * layer.factor;

				doc.write([
					`Insulation:`,
					`${layer.thickness}mm ${layer.name}`,
					Round(Insu_CO2, 2),
					'kg CO₂-eq/m²',
				]);

				Insu_CO2_total += Insu_CO2;
			});
		}

		let totalC02 =
			this.slab.Concrete.CO2(slabVolume, level) + this.reinforcement.fibers.CO2(slabVolume, level);
		totalC02 += this.reinforcement.steel.CO2((totalSteel * densitySteel) / 1000, level);
		totalC02 += Insu_CO2_total * totalArea;

		let emmision_per_m2 = totalC02 / totalArea;

		// doc.lineBreak();
		doc.rowWidth = [25, 20, 10, 10];
		doc.allignChildren = ['left', 'left', 'right', 'left'];
		doc.style = { 'font-weight': 'bold' };

		doc.write(['Total Global Warming Potential:', 'Entire slab:', Round(totalC02, 1), 'kg CO₂-eq']);
		doc.write(['', 'Average per square meter:', Round(emmision_per_m2, 1), 'kg CO₂-eq/m²']);

		if (makeComparison) {
			let refSlab = referenceSlab(cradleToGrave, this.#testetLoads, this.subbase, this.parameters);

			if (refSlab.CO2 !== 999) {
				let savings = (emmision_per_m2 - refSlab.CO2) / refSlab.CO2;

				let signSymbol = '+';
				if (savings < 0) signSymbol = '';

				// colour in accordance with savings %
				let savingsString = signSymbol + Round(savings * 100, 1) + '%';
				let savingsHue = Math.max(1, Math.min(120, 60 - (savings / 0.5) * 60));
				doc.style = { color: hslToHex(savingsHue, 100, 40), 'font-weight': 'bold' };

				doc.write(['Comparison to reference:', 'Relative savings', savingsString]);
			}

			doc.style = { 'font-style': 'italic' };
			doc.write([`Reference slab: `, `${refSlab.name}`]);
			doc.style = { color: '' };
		}

		// doc.lineBreak();
		doc.writeTitle('EPD Links');
		doc.rowWidth = [10, 80];
		doc.allignChildren = ['left', 'left'];
		doc.write([`Concrete: ${this.slab.Concrete.EPD_link}`]);
		if (this.reinforcement.fibers.content > 0) {
			// doc.lineBreak();
			doc.write([`Fibers: ${this.reinforcement.fibers.EPD_link}`]);
		}
		if (totalSteel > 0) {
			// doc.lineBreak();
			doc.write([`Steel: ${this.reinforcement.steel.EPD_link}`]);
		}

		if (this.subbase.insulation_layers.length > 0) {
			this.subbase.insulation_layers.forEach((layer) => {
				// doc.lineBreak();
				doc.write([`${layer.name}: ${layer.EPD_link}`]);
			});
		}

		// doc.lineBreak();
		doc.style = { 'font-style': 'italic' };
		doc.write(
			'NOTE: Above calculations are qualified estimates. The Global warming potential of materials will vary greatly between suppliers and locations'
		);

		return {
			doc,
			emmision_per_m2,
		};
	}

	#processLoads(loadArray: generalLoad[]) {
		let processedLoads: generalLoad[] = [];
		let possible_positions: position[] = ['internal', 'edge', 'corner'];

		// let trueEdge = [true, false];

		let checkJointCorners = this.parameters.Code !== 'TR34';
		if (!checkJointCorners) {
			console.warn('Omitting verification at joint corners');
		}

		// loop over each load:
		loadArray.forEach((load) => {
			//
			if (load.type !== 'uniform' && load.type !== 'line') {
				// convert to eq radius
				if (load.footprint.shape === 'round') {
					load.eq_radius = load.footprint.r;
				} else {
					load.eq_radius = Math.sqrt((load.footprint.l * load.footprint.w) / Math.PI);
				}

				// if close spacing for dual- or quad: convert to single:
				let minDist = Math.max(2 * this.slab.thickness, 2.5 * load.eq_radius);
				load = combinedSmallLoads(load, minDist, this.l);
				//	pending!
			}

			if (load.type === 'uniform') {
				let newLoad = { ...load };
				newLoad.position = 'internal';

				processedLoads.push(newLoad);
			} else if (load.type === 'line') {
				let newLoad = { ...load };

				if (load.dist_x < 3 / this.lambda) {
					newLoad.position = 'edge';
					processedLoads.push(newLoad);
				} else {
					newLoad.position = 'internal';
					processedLoads.push(newLoad);
				}
			} else {
				//concentrated loads:
				let crit_dist = load.eq_radius + this.l;

				// position not know:
				if (load.position === 'any') {
					//loop through each possible new position:

					possible_positions.forEach((newPosition) => {
						load = load as singleLoad | dualLoad | quadLoad; // pointless line to satisfy confused TypeScript

						if (newPosition === 'internal') {
							// for internal: simply add load at that position:
							{
								let newLoad = { ...load };
								newLoad.position = newPosition;
								processedLoads.push(newLoad);
							}

							if (this.slab.withJoints) {
								// joints:

								let newLoad1 = convertNearPerimeter(load, 'edge', crit_dist);
								newLoad1.trueEdge = false;
								processedLoads.push(newLoad1);

								// Maybe exclude this? Is joint-corners actually a problem?
								if (checkJointCorners) {
									let newLoad2 = convertNearPerimeter(load, 'corner', crit_dist);
									newLoad2.trueEdge = false;
									processedLoads.push(newLoad2);
								}
							}
						} else if (newPosition === 'corner' || newPosition === 'edge') {
							// wheel distance greater than critial: convert to point load:
							let newLoad = convertNearPerimeter(load, newPosition, crit_dist);
							newLoad.trueEdge = true;
							processedLoads.push(newLoad);
						} else {
							console.warn('should not be here!!');
						}
					});
				} else if (load.position === '') {
					// If position KNOWN:
					let position: position = 'edge';
					if (load.dist_l > crit_dist && load.dist_w > crit_dist) {
						// both x/y greater than limit: internal
						position = 'internal';
					} else if (load.dist_l < crit_dist && load.dist_w < crit_dist) {
						// both x/y less than limit: coner
						position = 'corner';
					}

					// if "at joints", add addition edge-joint and corner-joint positions:
					if (load.atJoints && position === 'internal') {
						let newLoad = { ...load };
						newLoad.position = 'internal';
						processedLoads.push(newLoad);

						if (this.slab.withJoints) {
							// joints:

							let newLoad1 = convertNearPerimeter(load, 'edge', crit_dist);
							newLoad1.trueEdge = false;
							processedLoads.push(newLoad1);

							// Maybe exclude this? Is joint-corners actually a problem?
							if (checkJointCorners) {
								let newLoad2 = convertNearPerimeter(load, 'corner', crit_dist);
								newLoad2.trueEdge = false;
								processedLoads.push(newLoad2);

								console.log('corner-joint load added: ', newLoad2);
							}
						}

						// });
					} else {
						// if not at joints, simply add load at that position:
						let newLoad = { ...load };
						newLoad.position = position;
						newLoad.trueEdge = true;
						processedLoads.push(newLoad);
					}
				} else {
					// if position is already defined:
					let newLoad = { ...load };
					processedLoads.push(newLoad); // does this ever happen?!
				}
			}
		});

		return processedLoads;
	}

	verifyLoads(loadArray: generalLoad[], preprocessLoads = true) {
		// function that takes an array of load objects and verified each of them.
		// returns array of output objects of following structure:
		let output: {
			originalLoad: generalLoad;
			documentation: docWriter;
			capacity: number;
			punchingCapacity: number;
			UR: number;
		}[] = [];

		// step 1: process loads: Loads of unknown position are dublicated for internal/edge/cornerv

		let processedLoads = loadArray;
		if (preprocessLoads) processedLoads = this.#processLoads(loadArray);

		let l = this.l;

		//edge/corner reduction factor for dual & quad points loads:
		const reductionFactor = (
			a: number,
			Mn: number,
			Mp: number,
			position: position,
			type: string
		) => {
			// function to calculate reduction factor from internal -> edge/corner for a pointload.
			// use to scale capacities of dual and quad loads:

			// -- not sure this is best method!

			if (type === 'single') return 1;

			let ratio = Math.max(0, Math.max(a / this.l, 0.2)) / 0.2;

			if (position === 'edge') {
				return (
					(Mn * (a * ratio + 3 * (l - a))) / (Math.PI * (Mp + Mn) * (3 * l - 2 * a)) +
					(a * ratio + 3 * l - 2 * a) / (12 * l - 8 * a)
				);
			} else if (position === 'corner') {
				return (Mn * (2 * a * ratio + 3 * (l - a))) / (3 * Math.PI * (Mp + Mn) * (l - a));
			} else return 1;
		};

		let worst_UR = { any: 0, internal: 0, edge: 0, corner: 0 };
		let worst_idx = { any: 0, internal: 0, edge: 0, corner: 0 };

		let idx = 0;
		processedLoads.forEach((load) => {
			let documentation = new docWriter();

			documentation.writeTitleTwo('Verification of critical load');

			let capacity: number;
			let appliedLoad: number;

			let punchingCapacity = 0;
			let UR_Punch = 0;

			let reinfPosition = load.position;
			let edgeString = '';
			let edgeCapacity = 0;

			if (
				(load.type === 'quad' || load.type === 'dual' || load.type === 'single') &&
				!load.trueEdge
			) {
				reinfPosition = 'internal';
				edgeString = '-joint';
				edgeCapacity = Math.min(this.#jointTransfer(), 0.5);
				if (load.position === 'corner') {
					edgeCapacity = 1 - (1 - edgeCapacity) ** 2;
					// increased load transfer for corner loads
				}
			}

			let Mn = this.#Mn(reinfPosition);
			let Mp = this.#Mp(reinfPosition);

			if (load.P < 0) {
				// change signs
				Mp = this.#Mrd_detailed('top', reinfPosition);
				Mn = this.#Mrd_detailed('bot', reinfPosition);
			}

			if (load.type === 'uniform') {
				appliedLoad = load.P;

				// if (this.parameters.Code === 'TR34') {
				// 	// allow uncracked positive side:
				// }
				Mp = this.#Mp(reinfPosition, true);

				documentation.rowWidth = [25, 5, 15];
				documentation.allignChildren = ['left', 'left', 'left'];
				documentation.write([`Uniform distributed load (UDL) verification: ${load.name}`]);

				if (appliedLoad < 0) {
					documentation.write(['Negative UDLs are not allowed']);
					capacity = 0;
				} else {
					documentation.lineBreak();
					documentation.concat(Mn.doc);
					documentation.lineBreak();
					documentation.concat(Mp.doc);
					documentation.lineBreak();

					documentation.writeTitle('Elastic solutions as per Hetenyi');

					documentation.rowWidth = [25, 20, 5, 5, 5];
					documentation.allignChildren = ['left', 'left', 'center', 'right', 'left'];

					documentation.write([
						'Moment shape function:',
						'$$ B_{\\lambda}(x) = e^{-\\lambda x} \\sin{\\lambda x} $$',
					]);

					documentation.write([
						'Sagging moment under local distributed load \\( q_{i} \\), of width \\( 2c_{i} \\):',
						'$$ M^{+} = q_{i} \\ \\frac{B_{\\lambda} (c_{i})}{2 \\lambda^{2}}  $$',
					]);

					let c = Math.PI / (4 * this.lambda);
					let B = (c: number) => Math.exp(-this.lambda * c) * Math.sin(this.lambda * c);

					documentation.write([
						'Critical UDL patch size:',
						'$$ c_{cr} = \\frac{\\pi}{4 \\lambda} = $$',
						Round(c, 2),
						'mm',
					]);

					let q_p = (2 / B(c)) * this.lambda ** 2 * 1e6 * Mp.value;

					documentation.write([
						'Capacity limited by sagging moment:',
						'$$ q_{P} = \\frac{2}{B_{\\lambda}(c_{cr})} \\lambda^{2} M_{P} = $$',
						Round(q_p, 2),
						'kN/m²',
					]);

					documentation.lineBreak();
					documentation.write([
						'Negative bending moment at distance \\( a_{i} \\) from local UDL \\( q_{i} \\) of width \\( \\left( b_{i}-a_{i} \\right) \\)',
						'$$ M^{-} = q_{i} \\ \\frac{1}{4 \\lambda^{4}} \\left( B_{\\lambda}(a_i) - B_{\\lambda}(b_i) \\right) $$',
					]);

					let a_1 = c;
					let b_1 = Math.PI / this.lambda + a_1;

					documentation.write([
						'Critical distance between adjecent UDL patches:',
						'$$ 2 a_{cr} = \\frac{\\pi}{2 \\lambda} = $$',
						Round(2 * a_1, 1),
						'mm',
					]);
					documentation.write([
						'Critical width of adjecent UDL patches:',
						'$$ b_{cr} - a_{cr} = \\frac{\\pi}{\\lambda} = $$',
						Round(b_1 - a_1, 1),
						'mm',
					]);

					// let q_n = 5.95 * Math.pow(this.lambda, 2) * 1e6 * Mn.value;
					let q_n = ((2 * Math.pow(this.lambda, 2)) / (B(a_1) - B(b_1))) * 1e6 * Mn.value;

					documentation.write([
						'Capacity limited by hogging moment (Contribution from 2 adjecent UDL patches):',
						'$$ q_{N} = \\frac{2 \\lambda^{2}}{ B_{\\lambda}(a_{cr}) - B_{\\lambda}(b_{cr})  } M_{N} = $$',
						Round(q_n, 2),
						'kN/m²',
					]);

					capacity = Math.min(q_n, q_p);

					documentation.lineBreak();
					documentation.write([
						'Resulting UDL capacity:',
						'$$ q_{Rd} = \\min \\left( q_{P} \\ , \\ q_{N} \\right) = $$',
						Round(capacity, 2),
						'kN/m²',
					]);
				}
			} else if (load.type === 'line') {
				// Line load
				documentation.write('Verification of line load as per TR34');
				documentation.rowWidth = [25, 20, 5, 5, 5];
				documentation.allignChildren = ['left', 'left', 'center', 'right', 'left'];

				let dist = load.dist_x;

				if (dist === undefined) {
					documentation.write(['Distance of load from edge:', '$$ l_p = $$', 'Unknown', '']);
					dist = 4 / this.lambda;
				} else {
					documentation.write(['Distance of load from edge:', '$$ l_p = $$', dist, 'mm']);
				}

				appliedLoad = load.P;

				if (appliedLoad < 0) {
					documentation.write(['Negative line load not supported', '']);
					capacity = 0;
				} else {
					let factor = Math.min(4, Math.max(3, 2 + dist * this.lambda));

					documentation.write([
						'Edge capacity reduction factor:',
						'$$ k_{edge} = \\min \\left[ 4, \\ \\max \\left( 2 + l_p \\lambda , \\ 3 \\right) \\right] = $$',
						factor,
						'',
					]);

					let M_un = this.#M_uncracked();
					capacity = factor * this.lambda * 1e3 * M_un.value; // should Mn just be uncracked always??

					documentation.concat(M_un.doc);
					documentation.write([
						'Line load capacity:',
						'$$ p_{Rd} = k_{edge} \\lambda M_{un} = $$',
						Round(capacity, 2),
						'kN/m',
					]);
				}
			} else {
				// Concentrated loads:

				appliedLoad = load.P;
				let a = load.eq_radius;

				documentation.rowWidth = [20, 5, 15];
				documentation.allignChildren = ['left', 'left', 'left'];
				documentation.write([`Concentrated load verification: ${load.name}`]);
				documentation.write([`Load position: ${load.position + edgeString}`]);
				documentation.write([`Load Type: ${load.type}`]);
				if (load.note != '') {
					documentation.write([load.note]);
				}
				documentation.lineBreak();

				documentation.rowWidth = [20, 5, 5, 5];
				documentation.allignChildren = ['left', 'right', 'right', 'left'];

				documentation.write(['Total Load magnitude', '\\( P = \\)', Round(load.P, 2), 'kN']);
				documentation.write([
					'Equivalent radius of load contact area:',
					'\\( a = \\)',
					Round(a, 1),
					'mm',
				]);

				l = this.l;
				if (load.P < 0) {
					documentation.write([
						'Negative load (Lift), Utilization of subbase limited:',
						'$$ l \\rightarrow \\infty $$',
						'',
					]);
					l = 1e5;
				}

				if (load.type !== 'single') {
					documentation.write([
						'Distance between contact areas:',
						'\\( l_{x} = \\)',
						Round(load.load_dist_x, 1),
						'mm',
					]);

					if (load.type === 'quad') {
						documentation.write(['', '\\( l_{y} = \\)', Round(load.load_dist_y, 1), 'mm']);
					}
				}

				if (this.#dowels.P > 0 && !load.trueEdge) {
					documentation.lineBreak();
					documentation.concat(this.#dowels.capacityDoc);
				}

				documentation.lineBreak();
				documentation.write('Moment capacity:', 'strong');
				documentation.concat(Mn.doc);
				documentation.lineBreak();
				documentation.concat(Mp.doc);

				if (appliedLoad < 0) {
					documentation.write(['Negative load (Lift), Moment capacity signs reversed', '']);
				}

				let Pu0: number;
				let Pu2: number;

				let ratio = Math.min((5 * a) / l, 1);

				documentation.lineBreak();
				documentation.writeTitle(`Yield line solution: ${load.type} load - ${load.position}`);
				documentation.write('Meyerhof equations:');

				documentation.rowWidth = [20, 25, 5, 5, 5];
				documentation.allignChildren = ['left', 'left', 'center', 'right', 'left'];
				if (load.type === 'single') {
					// define P_u,0 and P_u,0.2 depending on the load position:

					if (load.position === 'internal') {
						Pu0 = 2 * Math.PI * (Mn.value + Mp.value);
						documentation.write([
							'Soft-ground solution \\( a/l = 0\\) :',
							'\\( P_{u0} = 2 \\pi (M_{N} + M_{P})  \\)',
							'',
							'',
						]);
						Pu2 = ((4 * Math.PI) / (1 - a / (3 * l))) * (Mn.value + Mp.value);
						documentation.write([
							'Solid-ground solution \\( (a/l \\ge 0.2) \\) :',
							'\\( P_{u2} = \\frac{4 \\pi}{1 - \\frac{a}{3l}} (M_{N} + M_{P})  \\)',
							'',
							'',
						]);
					} else if (load.position === 'edge') {
						Pu0 = (Math.PI * (Mn.value + Mp.value)) / 2 + 2 * Mn.value;

						documentation.write([
							'Soft-ground solution \\( (a/l = 0) \\) :',
							'\\( P_{u0} = \\dfrac{\\pi}{2} (M_{N} + M_{P}) + 2 M_{N} \\)',
							'',
							'',
						]);

						Pu2 = (Math.PI * (Mn.value + Mp.value) + 4 * Mn.value) / (1 - (2 * a) / (3 * l));
						documentation.write([
							'Solid-ground solution \\( (a/l \\ge 0.2) \\) :',
							'\\( P_{u2} = \\dfrac{\\pi (M_{N} + M_{P}) + 4 M_{N}}{ 1 - \\frac{2a}{3l} } \\)',
							'',
							'',
						]);
					} else if (load.position === 'corner') {
						Pu0 = 2 * Mn.value;
						documentation.write([
							'Soft-ground solution \\( (a/l = 0) \\) :',
							'$$ P_{u0} = 2 M_{N} $$',
							'',
							'',
						]);

						Pu2 = (4 * Mn.value) / (1 - a / l);
						documentation.write([
							'Solid-ground solution \\( (a/l \\ge 0.2) \\) :',
							'$$ P_{u2} = \\dfrac{4 M_{N}}{ 1 - \\frac{a}{l} } $$',
							'',
							'',
						]);
					} else {
						console.warn('you shouldnt be here! 🤡');
					}
				} else if (load.type === 'dual') {
					let x = load.load_dist_x;

					if (load.position !== 'internal') {
						documentation.write(
							`Note: No Meyerhof solution for dual load at ${load.position}. Solution found by reducing internal solution by ratio given by single-load solution as per TR34`
						);
					}

					Pu0 = (2 * Math.PI + (1.8 * x) / l) * (Mp.value + Mn.value);
					documentation.write([
						'Soft-ground solution \\( (a/l = 0) \\) :',
						'\\( P_{u0} = \\left( 2 \\pi + \\dfrac{1.8 x}{l} \\right) (M_{N} + M_{P})  \\)',
					]);

					Pu2 =
						((4 * Math.PI) / (1 - a / (3 * l)) + (1.8 * x) / (l - a / 2)) * (Mp.value + Mn.value);
					documentation.write([
						'Solid-ground solution \\( (a/l \\ge 0.2) \\) :',
						'\\( P_{u2} = \\left( \\dfrac{4 \\pi}{1 - \\frac{a}{3l}} + \\dfrac{1.8 x}{l - \\frac{a}{2} } \\right) (M_{N} + M_{P})  \\)',
					]);
				} else {
					// quad load

					if (load.position !== 'internal') {
						documentation.write(
							`Note: No Meyerhof solution for quad load at ${load.position}. Solution found by reducing internal solution by ratio given by single-load solution as per TR34* `
						);
					}

					let x = load.load_dist_x;
					let y = load.load_dist_y;

					Pu0 = (2 * Math.PI + (1.8 * (x + y)) / l) * (Mp.value + Mn.value);
					documentation.write([
						'Soft-ground solution \\( (a/l = 0) \\) :',
						'\\( P_{u0} = \\left( 2 \\pi + \\dfrac{1.8 (x+y)}{l} \\right) (M_{N} + M_{P}) = \\)',
						Round(Pu0, 2),
						'kN',
					]);

					Pu2 =
						((4 * Math.PI) / (1 - a / (3 * l)) + (1.8 * (x + y)) / (l - a / 2)) *
						(Mp.value + Mn.value);
					documentation.write([
						'Solid-ground solution \\( (a/l \\ge 0.2) \\) :',
						'\\( P_{u2} = \\left( \\dfrac{4 \\pi}{1 - \\frac{a}{3l}} + \\dfrac{1.8 (x+y)}{l - \\frac{a}{2}} \\right) (M_{N} + M_{P}) = \\)',
						Round(Pu2, 2),
						'kN',
					]);
				}

				// interpolated capacity between Pu0 and Pu2:
				let redFactor = reductionFactor(a, Mn.value, Mp.value, load.position, load.type);
				capacity = ((Pu0 + ratio * (Pu2 - Pu0)) * redFactor) / (1 - edgeCapacity);

				documentation.write([
					'Ground stiffness factor:',
					'\\( \\alpha = \\min\\left( \\dfrac{5 a}{l} , 1 \\right) = \\)',
					Round(ratio, 2),
					'',
				]);

				let beta = '';
				if (redFactor !== 1) {
					beta = `\\beta_{${load.position}}`;
					documentation.write([
						`Positioning reduction factor:`,
						`$$ ${beta}  = \\dfrac{P_{Rd, ${load.position},single }}{P_{Rd,internal,single}} = $$`,
						Round(redFactor, 2),
						'',
					]);
				}

				if (edgeCapacity !== 0) {
					if (load.position === 'corner' && !load.trueEdge) {
						documentation.write([
							'Nominal joint load transfer:',
							'$$ \\chi_k = $$',
							Round(this.#jointTransfer() * 100, 1),
							'%',
						]);

						documentation.write([
							'Load transfer at corners:',
							'$$ \\chi = 1 - \\left( 1 - \\chi_k \\right)^2 $$',
							Round(edgeCapacity * 100, 1),
							'%',
						]);
					} else {
						documentation.write([
							'Joint load transfer:',
							'$$ \\chi = $$',
							Round(edgeCapacity * 100, 1),
							'%',
						]);
					}

					let dowelStr = '';

					if (this.#dowels.P > 0) {
						documentation.write([
							'Load capacity per dowel:',
							'\\( P_{dowel,i} = \\)',
							Round(this.#dowels.P, 2),
							'kN',
						]);

						let ActiveDownDist = 1.8 * l; // more for dual/quad at edges!!

						let N_dowel = ActiveDownDist / this.#dowels.spacing;
						documentation.write([
							'Number of active dowels:',
							'\\( N_{dowel} = \\frac{1.8 l}{s_{d} } = \\)',
							Round(N_dowel, 2),
							'',
						]);

						let P_dowel = this.#dowels.P * N_dowel;
						documentation.write([
							'Total dowel load transfer:',
							'\\( P_{dowel} = N_{dowel} \\cdot P_{dowel,i} = \\)',
							Round(P_dowel, 2),
							'kN',
						]);

						dowelStr = `+ P_{dowel}`;
						capacity += P_dowel;
					}

					documentation.write([
						'Total bearing capacity:',
						`$$  P_{Rd} = \\dfrac{ ${beta}  \\left[ P_{u0} + \\alpha \\left( P_{u2} - P_{u0} \\right) \\right] }{1 - \\chi } ${dowelStr} = $$ `,
						Round(capacity, 2),
						'kN',
					]);
				} else {
					// if no edge load transfer/not at an edge:
					documentation.write([
						'Total bearing capacity:',
						`$$ P_{Rd} = ${beta}  \\left[ P_{u0} + \\alpha \\left( P_{u2} - P_{u0} \\right) \\right] = $$`,
						Round(capacity, 2),
						'kN',
					]);
				}

				documentation.lineBreak();
				let punching = this.#punchingCapacity(load);

				// documentation.push('Punching verification:');
				documentation.concat(punching.doc);

				punchingCapacity = punching.capacity;

				UR_Punch = Math.abs(load.PunchingLoad / punchingCapacity);

				documentation.style = { 'font-style': 'italic' };
				if (UR_Punch > 1) {
					documentation.write(['', '', '', 'Not OK!']);
				} else {
					documentation.write(['', '', '', 'OK!']);
				}
			}

			let UR = Math.abs(appliedLoad / capacity);

			if (UR_Punch > 0) {
				UR = Math.max(UR_Punch, UR);
			}

			// return {
			// 	originalLoad: load,
			// 	documentation,
			// 	capacity,
			// 	punchingCapacity,
			// 	UR,
			// }

			output.push({
				originalLoad: load,
				documentation,
				capacity,
				punchingCapacity,
				UR,
			});

			if (UR > worst_UR[load.position]) {
				worst_UR[load.position] = UR;
				worst_idx[load.position] = idx;
			}
			if (UR > worst_UR['any']) {
				worst_UR['any'] = UR;
				worst_idx['any'] = idx;
			}

			idx++;
		});

		this.#testetLoads = processedLoads;

		return {
			output,
			worst_UR,
			worst_idx,
		};
	}

	#jointTransfer() {
		let transfer = 0.15;

		if (this.slab.joints.type === 'Custom') {
			transfer = this.slab.joints.transfer / 100;
		}

		return transfer;
	}

	#dowelCapacity() {
		let doc = new docWriter();
		doc.rowWidth = [25, 20, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let fyd = this.#dowels.steelClass / this.gamma.s;
		let fcd = this.slab.Concrete.f_cd(this.gamma.cc);
		let ø = this.#dowels.dia;

		let maxOpening = 15; //mm

		doc.write('Capacity of dowels:', 'strong');

		// shear capacity:
		let A_shear = (0.9 * ø ** 2 * Math.PI) / 4;

		doc.write([
			'Dowel Shear Area:',
			'$$ A_{shear,i} = 0.9 \\cdot ø^2  \\frac{\\pi}{4} = $$',
			Round(A_shear, 2),
			'mm²',
		]);

		let P_shear = 0.6 * fyd * A_shear * 1e-3;
		doc.write([
			'Individual dowel shear capacity:',
			'$$ P_{shear,i} = 0.6 \\cdot f_{yd} \\cdot A_{shear} = $$',
			Round(P_shear, 2),
			'kN',
		]);

		// bearing/bending capacity:
		doc.lineBreak();

		doc.write(['Maximum opening:', '$$ O_{max} = $$', Round(maxOpening, 2), 'mm']);

		let e = maxOpening / 2;
		doc.write(['Eccentricity:', '$$ e = \\dfrac{O_{max}}{2} = $$', Round(e, 2), 'mm']);

		let alpha = ((3 * e) / ø) * Math.sqrt(fcd / fyd);
		doc.write([
			'Alpha factor:',
			'$$ \\alpha = \\dfrac{3 e}{ø} \\cdot \\sqrt{\\dfrac{f_{cd}}{f_{yd}}} = $$',
			Round(alpha, 2),
			'',
		]);

		let P_bearing = ø ** 2 * Math.sqrt(fcd * fyd) * (Math.sqrt(1 + alpha ** 2) - alpha) * 1e-3;
		doc.write([
			'ndividual dowel bearing capacity:',
			'$$ P_{bearing,i} = ø^2 \\cdot \\sqrt{f_{cd} f_{yd}} \\cdot \\left( \\sqrt{1+\\alpha^2} - \\alpha \\right) = $$',
			Round(P_bearing, 2),
			'kN',
		]);

		let P = Math.min(P_shear, P_bearing);

		doc.write([
			'Individual dowel capacity:',
			'$$ P_{dowel,i} = \\min \\left( P_{shear}, P_{bearing} \\right) = $$',
			Round(P, 2),
			'kN',
		]);

		// save to dowel object:
		this.#dowels.P = P;
		this.#dowels.capacityDoc = doc;
	}

	#M_uncracked() {
		let doc = new docWriter();
		doc.rowWidth = [25, 20, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let t = this.slab.thickness;
		let height_factor = Math.max(1, 1.6 - t / 1000);

		let alpha = 1; // reduced for unreinforced???

		// let alpha = 0.8;
		// if (this.parameters.NationalAnnex === 'DK NA') {
		// 	alpha = 1;
		// }

		let f_ctd = this.slab.Concrete.f_ctd(this.gamma.ct, alpha);

		f_ctd *= height_factor;

		let heightFactStr = '';
		if (height_factor > 1) {
			heightFactStr = ' \\left( 1.6 - \\frac{t}{1000 \\text{mm}} \\right) ';
		}

		if (this.parameters.Code === 'TR34') {
			f_ctd = (height_factor * this.slab.Concrete.f_ctm_time()) / this.gamma.ct;

			doc.write([
				'Concrete tensile capacity :',
				`$$ f_{ctd} = ${heightFactStr} \\frac{f_{ctm}}{\\gamma_{ct}} = $$`,
				Round(f_ctd),
				'MPa',
			]);
		} else {
			doc.write([
				'Concrete tensile capacity :',
				`$$ f_{ctd} = ${heightFactStr} \\frac{f_{ctk, 0.05}}{\\gamma_{ct}} = $$`,
				Round(f_ctd),
				'MPa',
			]);
		}

		let Mrd = (f_ctd * ((t * t) / 6)) / 1000;

		doc.write([
			'Uncracked capacity:',
			'$$ M_{un} = f_{ctd} \\frac{t^{2}}{6} = $$',
			Round(Mrd),
			' kNm/m',
		]);

		return { value: Mrd, doc };
	}

	#Mn(location: position, allowUncracked = true) {
		let momentCalc: { value: number; doc: docWriter } = this.Mn_storage[location];

		let uncracked: any = {};
		uncracked.value = 0;

		if (allowUncracked) {
			uncracked = this.#M_uncracked();
		}

		if (momentCalc.value === 0) {
			if (this.parameters.Code === 'TR34') {
				momentCalc = this.#TR34_Mrd('top', location);
			} else {
				// uncracked allowed?

				momentCalc = this.#Mrd_detailed('top', location);
			}

			if (uncracked.value > momentCalc.value) {
				momentCalc = uncracked;
				momentCalc.doc.write([
					'Negative moment capacity:',
					'$$ M_{N,Rd} = M_{un} = $$',
					Round(momentCalc.value),
					' kNm/m',
				]);
			}

			// store value for later use:
			this.Mn_storage[location] = momentCalc;
		}

		// otherwise: EN:

		return momentCalc;
	}

	#Mp(location: position, allowUncracked = false) {
		let momentCalc: { value: number; doc: docWriter } = this.Mp_storage[location];

		let uncracked: any = {};
		uncracked.value = 0;

		if (allowUncracked) {
			uncracked = this.#M_uncracked();
		}

		if (momentCalc.value === 0) {
			if (this.parameters.Code === 'TR34') {
				momentCalc = this.#TR34_Mrd('bot', location);
			} else {
				momentCalc = this.#Mrd_detailed('bot', location);
			}

			// store value:
			this.Mp_storage[location] = momentCalc;
		}

		if (uncracked.value > momentCalc.value) {
			momentCalc = uncracked;
			momentCalc.doc.write([
				'Positive moment capacity:',
				'$$ M_{P,Rd} = M_{un} = $$',
				Round(momentCalc.value),
				' kNm/m',
			]);
		}
		// EN1992:
		//...
		return momentCalc;
	}

	#Mrd_detailed(face: 'top' | 'bot', location: position) {
		// detailed moment capacity calc from CrossSeciton tool

		let local_reinf = this.reinforcement[location] as localReinforcement;
		let sigString = 'Positive';

		let SectionForces = {
			N: 0,
			Mz: 1,
			Vz: 0,
			My: 0,
			Vy: 0,
			T: 0,
			eps_sh: 0,
			Verification: 'ULS',
			cotTheta: undefined,
		};

		let NP = 'P';
		if (face === 'top') {
			SectionForces.Mz = -1;
			sigString = 'Negative';
			NP = 'N';
		}

		let fibers = this.reinforcement.fibers;

		let concrete = this.slab.Concrete;

		let spaceToMid =
			this.slab.thickness / 2 -
			local_reinf.bot_cover -
			local_reinf.bot_dia -
			local_reinf.mid_dia / 2;

		let section = new Rectangular(this.slab.thickness + 0.1, 1000, concrete, fibers, 301, 2); // for some reason n=300 gave a NaN for t=104mm ??? and for n=299 for t=200??
		let reinf = new Reinforcement(section, {
			Type: 'Rectangular',
			Material: this.reinforcement.steel,
			layers: [1, 2, -1],
			bar_dia: [local_reinf.bot_dia, local_reinf.mid_dia, local_reinf.top_dia],
			bar_spacing: [local_reinf.bot_spacing, local_reinf.mid_spacing, local_reinf.top_spacing],
			spec_space: [1, spaceToMid, 1], // Possible explicitly defined free space between layers
			cover_layer_bot: local_reinf.bot_cover,
			cover_layer_top: local_reinf.top_cover,

			stirr_dia: 0,
			stirr_legs: 2,
			stirr_spacing: 150,
		});

		let AnalysisParameters = {
			Code: 'EC', // Crack calculations per which code ('EC','fib','Watts')
			NationalAnnex: this.parameters.NationalAnnex, // Nation annex choixes
			Rely_on_Conc_tens: false, // Can tensile capacity of the concrete be utilized for analysis?
			Concrete_stress_function: 'parabolic', // Default: linear, other options: 'parabolic' OR 'bi-linear'
			Strain_harden: true, // Allow for strain hardening of reinforcement.
			max_iterations: 1000, // Maximum allowable iterations to find solution before stopping (Default = 1000)
			crack_limit: this.parameters.crack_limit, // Design crack width - for SLS only
		};

		let Analysis = new CrossSectionAnalysis(section, reinf, AnalysisParameters);
		let Ultimate = Analysis.Get_ultimate_capacity(SectionForces, true);

		let Mrd = Math.abs(Ultimate.Mrd);

		let doc = new docWriter();
		doc.writeTitle(sigString + ' moment capacity from cross-section analysis');
		doc.push(Analysis.output);

		doc.allignChildren = ['left', 'left', 'right', 'right', 'left'];
		doc.rowWidth = [25, 20, 5, 5];
		doc.write([
			`Resultsing ${sigString} moment capacity:`,
			`$$ M_{${NP},Rd} = \\int_{-t/2}^{t/2} \\sigma \\, z \\ dz = $$`,
			Round(Mrd),
			' kNm/m',
		]);

		return {
			value: Mrd,
			doc: doc,
		};
	}

	#punchingCapacity(load: singleLoad | dualLoad | quadLoad) {
		let t = this.slab.thickness;

		let doc = new docWriter();
		doc.rowWidth = [20, 25, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		// use bottom reinforcement if tensile force
		let face = 'bottom';
		if (load.P < 0) face = 'top';

		let dia: number;
		let As = 0;
		let cover: number;

		let reinfPosition = load.position;
		if (!load.trueEdge) {
			reinfPosition = 'internal';
		}

		let localReinf = this.reinforcement[reinfPosition] as localReinforcement;

		let As_mid = (((localReinf.mid_dia ** 2 * Math.PI) / 4) * 1000) / localReinf.mid_spacing;

		if (face === 'top') {
			dia = localReinf.top_dia;
			As = dia ** 2 * (Math.PI / 4) * (1000 / localReinf.top_spacing) + As_mid;
			cover = localReinf.top_cover;
		} else {
			dia = localReinf.bot_dia;
			As = dia ** 2 * (Math.PI / 4) * (1000 / localReinf.bot_spacing) + As_mid;
			cover = localReinf.bot_cover;
		}

		// effective depth:
		let d = t - cover - dia; // cover to middle of mesh

		if (localReinf.bot_dia === 0 && localReinf.top_dia === 0) {
			d = t / 2;
		}

		if (As === 0) d = 0.75 * t;

		let rho = As / (d * 1000);

		let punchingRadius = 2 * d;

		// doc.write(['Equivalent load radius', '$$ a $$', '=', Round(load.eq_radius, 1), 'mm']);

		doc.writeHeader('Punching verification');
		doc.write([
			'Critical punching radius:',
			'$$ a_{crit} = 2 \\cdot d = $$',
			Round(punchingRadius, 1),
			'mm',
		]);

		// critical perimeter:
		let critPerimeter = this.#criticalPerimeter(load, punchingRadius); // !!
		let u = critPerimeter.u;
		doc.concat(critPerimeter.doc);

		let GroundReaction = this.#groundReaction(load, punchingRadius);
		doc.lineBreak();
		doc.concat(GroundReaction.doc);
		let R = GroundReaction.R;

		let fraction = '';
		switch (load.type) {
			case 'single':
				load.PunchingLoad = load.P;
				break;
			case 'dual':
				fraction = '\\frac{1}{2}';
				load.PunchingLoad = (1 / 2) * load.P;
				break;
			case 'quad':
				fraction = '\\frac{1}{4}';
				load.PunchingLoad = (1 / 4) * load.P;
				break;
		}

		load.PunchingLoad = load.PunchingLoad * (1 - R);

		let dowelStr = '';
		if (this.#dowels.P > 0 && !load.trueEdge) {
			doc.write([
				'Load transfer per dowel:',
				'$$ P_{dowel,i} = $$',
				Round(this.#dowels.P, 2),
				'kN',
			]);

			let N_dowel = (2 * punchingRadius) / this.#dowels.spacing;
			doc.write([
				'Number of active dowels within critical radius:',
				'$$ N_{dowel} = \\frac{2 a_{crit}}{s_{d}} = $$',
				Round(N_dowel, 2),
				'',
			]);

			let P_dowel = this.#dowels.P * N_dowel;
			doc.write([
				'Total load transfer within critical radius:',
				'$$ P_{V,dowel} = P_{dowel,i} \\cdot N_{dowel} = $$',
				Round(P_dowel, 2),
				'kN',
			]);

			load.PunchingLoad = load.PunchingLoad - P_dowel;
			dowelStr = ` - P_{V,dowel}`;
		}

		let ved = (load.PunchingLoad * 1000) / (u * d);

		doc.write([
			'Punching load:',
			`$$ V_{Ed} = ${fraction}  P \\ \\left( 1 - \\dfrac{R_{cp}}{P} \\right) ${dowelStr} = $$`,
			Round(load.PunchingLoad, 1),
			'kN',
		]);

		doc.write([
			'Punching shear stress:',
			`$$ v_{Ed} = \\dfrac{V_{Ed}}{ u_1 \\cdot d } = $$`,
			Round(ved, 2),
			'MPa',
		]);
		// shear strength:
		let strength = this.#punchingStrength(d, rho, ved);
		let vrd = strength.value;

		// parse documentation from punching strength function:
		doc.concat(strength.doc);

		let capacity = (u * d * vrd) / 1000;
		doc.write([
			'Punching Capacity:',
			'$$ V_{Rd} = v_{Rd} \\cdot u_{1} \\cdot d = $$',
			Round(capacity, 2),
			'kN',
		]);

		return {
			capacity,
			groundReaction: R,
			doc,
		};
	}

	#punchingStrength(d: number, rho: number, ved = 0) {
		// calculate the punching strength [MPa]
		// return both the capacity, Vrd [MPa] and array of documentation strings

		let V_rd = 0;
		let doc = new docWriter();
		// doc.style = { color: 'blue' }; // test
		doc.rowWidth = [20, 25, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let fibers = this.reinforcement.fibers;

		doc.writeTitle('Punching strength');

		doc.write(['Effective depth:', '$$ d =  $$', Round(d, 1), 'mm']);
		doc.write(['Reinforcement ratio:', '$$ \\rho =  $$', Round(rho * 100, 3), '%']);
		doc.lineBreak();

		if (this.parameters.Code === 'TR34') {
			// concrete contribution:
			let f_ck = this.slab.Concrete.f_ck;
			let k = Math.min(2, 1 + Math.pow(200 / d, 0.5));
			let V_rd_min = 0.035 * Math.pow(k, 1.5) * Math.pow(f_ck, 0.5);

			doc.write([
				'Effective depth factor:',
				'$$ k = 1 + \\sqrt{\\frac{200}{d} } \\leq 2.0 = $$',
				Round(k, 2),
				'',
			]);

			doc.write([
				'Unreinforced concrete:',
				'$$ v_{Rd,min} = 0.035 \\ k^{1.5} \\sqrt{f_{ck}} = $$',
				Round(V_rd_min),
				'MPa',
			]);

			let V_rd_s = ((0.18 * k) / this.gamma.cc) * Math.pow(100 * rho * f_ck, 0.33);

			let V_rd_c = Math.max(V_rd_s, V_rd_min);

			if (V_rd_s > 0) {
				doc.write([
					' Reinforced concrete:',
					'$$ v_{Rd,c} = \\dfrac{0.18 k}{\\gamma_{c}} \\left( 100 \\rho f_{ck} \\right)^{0.33} \\geq  v_{Rd,min} = $$',
					Round(V_rd_c, 2),
					'MPa',
				]);
			}
			// fiber contribution:
			let v_f = 0.015 * (fibers.f_R1 + fibers.f_R2 + fibers.f_R3 + fibers.f_R4);

			V_rd = V_rd_c + v_f;

			if (v_f > 0) {
				doc.write([
					'Fiber shear strength:',
					'$$  v_{f} = 0.015 \\left( f_{R1} + f_{R2} +f_{R3} +f_{R4} \\right) = $$',
					Round(v_f, 2),
					'MPa',
				]);

				doc.write([
					'Combined shear strength:',
					'$$  v_{Rd} = v_{Rd,c} + v_{f} = $$',
					Round(V_rd, 2),
					'MPa',
				]);
			}
		} else {
			// EC

			let f_ck = this.slab.Concrete.f_ck;

			// normal EC:
			doc.write('Shear strength according to EN1992-1-1 : §6.4.3');

			doc.write(['Centric loading within footprint:', '$$  \\beta = $$', 1, '']);

			let k = Math.min(2, 1 + Math.pow(200 / d, 0.5));
			doc.write([
				'Effective depth factor:',
				'$$ k = 1 + \\sqrt{\\frac{200}{d}  } \\leq 2.0 = $$',
				Round(k, 2),
				'',
			]);

			let Crd = 0.18 / this.gamma.cc;

			doc.write([
				' C Factor:', // name??
				'$$ C_{Rd,c} = \\dfrac{0.18}{\\gamma_c } = $$',
				Round(Crd, 2),
				'',
			]);

			doc.write([
				'No net axial force in slab:', // name??
				'$$ k_1 \\sigma_{cp} = $$',
				0,
				'MPa',
			]);

			let v_min = 0;

			if (this.parameters.NationalAnnex === 'DK NA') {
				v_min = (0.051 / this.gamma.cc) * Math.pow(k, 1.5) * Math.pow(f_ck, 0.5);

				doc.write([
					'Lower bound shear strength',
					'$$ v_{min} = \\frac{0.051}{\\gamma_{cc}} \\ k^{1.5} \\ \\sqrt{f_{ck}} = $$',
					Round(v_min, 2),
					'MPa',
				]);
			} else {
				v_min = 0.035 * Math.pow(k, 1.5) * Math.pow(f_ck, 0.5);

				doc.write([
					'Lower bound shear strength',
					'$$ v_{min} = 0.035 \\ k^{1.5} \\ \\sqrt{f_{ck}} = $$',
					Round(v_min, 2),
					'MPa',
				]);
			}

			if (fibers.f_R1k > 0) {
				let V_rd_c = Crd * k * Math.pow(100 * rho * f_ck, 1 / 3);

				doc.write([
					'Concrete shear strength',
					'$$ v_{Rd,c} = C_{Rd,c} \\ k \\ \\sqrt[3]{ 100 \\rho f_{ck} } + k_1 \\sigma_{cp} = $$',
					Round(V_rd_c, 2),
					'MPa',
				]);

				doc.write('Fibre contribution according to prEN1992-1-1 §L.8.4');
				let f_Ftud = fibers.f_Ftud(this.gamma.f);
				doc.write(['Fiber design strength:', '$$ f_{Ftud} = $$', Round(f_Ftud, 2), 'MPa']);

				let eta_c = Math.min(1, V_rd_c / ved);
				let eta_f = 1;

				doc.write([
					'FRC combination factors:',
					'$$ \\eta_c = \\dfrac{v_{Rd,c}}{v_{Ed}}  \\leq 1.0 = $$',
					Round(eta_c, 2),
					'',
				]);
				doc.write(['', '$$ \\eta_F = $$', Round(eta_f, 2), '']);

				V_rd = Math.max(eta_c * V_rd_c + eta_f * f_Ftud, eta_c * v_min + f_Ftud);

				doc.write([
					'Design shear strength:',
					'$$ v_{Rd,cF} = \\eta_c v_{Rd,c} + \\eta_F f_{Ftud} \\geq  \\eta_c v_{min} + \\eta_F f_{Ftud} = $$',
					Round(V_rd, 2),
					'MPa',
				]);
			} else {
				V_rd = Math.max(Crd * k * Math.pow(100 * rho * f_ck, 1 / 3), v_min);

				doc.write([
					'Design shear strength',
					'$$ v_{Rd,c} = C_{Rd,c} \\ k \\ \\sqrt[3]{ 100 \\rho f_{ck} } + k_1 \\sigma_{cp} \\geq v_{min} + k_1 \\sigma_{cp} = $$',
					Round(V_rd, 2),
					'MPa',
				]);
			}
		}

		return {
			value: V_rd,
			doc,
		};
	}

	#groundReaction(load: singleLoad | dualLoad | quadLoad, addedRadius: number) {
		// internal ground reaction - reduction of effecive punching force:
		// output: reduction ration (R/P)

		let R = 0;
		let doc = new docWriter();
		doc.rowWidth = [20, 25, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let a = load.eq_radius;

		doc.writeTitle('Ground reaction: punching load reduction');
		doc.write(`Position: ${load.position}`);
		doc.lineBreak();

		let r_max = 0;
		let Area = 0;
		let r_crit = 0;

		let B = 0;

		let jointReaction = 0;

		if (load.P < 0) {
			doc.write('Pulling force, No ground reaction');

			doc.write([
				'Total relative reaction within critical perimeter:',
				'$$ \\dfrac{R_{cp}}{P} = $$',
				0,
				'%',
			]);

			return {
				R: 0,
				doc,
			};
		}

		if (load.position === 'internal') {
			B = Math.sqrt(7.6) * this.l;

			doc.write([
				'Meyerhof distance to negative yield line:',
				'$$ B = \\sqrt{ 7.6 l^2 } = $$',
				Round(B, 1),
				'mm',
			]);

			r_max = (3 / (B ** 2 * Math.PI)) * 1e6;

			doc.write([
				'Relative peak soil reaction pressure:',
				'$$ \\dfrac{r_{max}}{P} = \\frac{3}{B^2 \\pi } = $$',
				Round(r_max, 3),
				'kPa/kN',
			]);

			Area = ((a + addedRadius) ** 2 * Math.PI) / 1e6;
		} else if (load.position === 'edge') {
			B = Math.sqrt(4.3) * this.l;

			doc.write([
				'Meyerhof distance to negative yield line:',
				'$$ B = \\sqrt{ 4.3 l^2 } = $$',
				Round(B, 1),
				'mm',
			]);

			r_max = (6 / (B ** 2 * Math.PI)) * 1e6;

			doc.write([
				'Relative peak soil reaction pressure:',
				'$$ \\dfrac{r_{max}}{P} = \\frac{6}{B^2 \\pi } = $$',
				Round(r_max, 3),
				'kPa/kN',
			]);

			Area = (0.5 * (a + addedRadius) ** 2 * Math.PI) / 1e6;

			if (load.trueEdge === false) {
				let X = this.#jointTransfer();
				let edgeLength = B * 2;
				let q_avg = X / edgeLength; // per mm
				let q_peak = 2 * q_avg;
				let q_perimeter = q_peak * Math.max(0, 1 - (a + addedRadius) / edgeLength);
				jointReaction = (2 * (a + addedRadius) * (q_perimeter + q_peak)) / 2;

				doc.write([
					'Relative peak reaction across joint:',
					'$$ \\dfrac{q_{cp,max}}{P} = \\dfrac{ \\chi}{B} = $$',
					Round(q_peak * 1000, 3),
					'kN/m/kN',
				]);
			}
		} else if (load.position === 'corner') {
			B = 2.7 * this.l;

			doc.write([
				'Meyerhof distance to negative yield line:',
				'$$ B = 2.7 \\ l = $$',
				Round(B, 1),
				'mm',
			]);

			r_max = (12 / (B ** 2 * Math.PI)) * 1e6;

			doc.write([
				'Relative peak soil reaction pressure:',
				'$$ \\dfrac{r_{max}}{P} = \\frac{12}{B^2 \\pi } = $$',
				Round(r_max, 3),
				'kPa/kN',
			]);

			Area = (0.25 * (a + addedRadius) ** 2 * Math.PI) / 1e6;

			if (load.trueEdge === false) {
				let X = this.#jointTransfer();
				let edgeLength = B * Math.sqrt(2);
				let q_avg = X / (2 * edgeLength); // per mm
				let q_peak = 2 * q_avg;
				let q_perimeter = q_peak * Math.max(0, 1 - (a + addedRadius) / edgeLength);
				jointReaction = (2 * (a + addedRadius) * (q_perimeter + q_peak)) / 2;

				doc.write([
					'Relative peak reaction across joint:',
					'$$ \\dfrac{q_{cp,max}}{P} = \\dfrac{ \\chi  \\sqrt{2} }{B} = $$',
					Round(q_peak * 1000, 3),
					'kN/m/kN',
				]);
			}

			// B += r
		} else {
			console.warn('Shouldnt be here!!💩');
		}

		r_crit = r_max * Math.max(0, 1 - (a + addedRadius) / B);

		doc.write([
			'Relative soil reaction pressure at critical perimeter:',
			'$$ \\dfrac{r_{cr}}{P} = r_{max} \\left( 1 - \\frac{a + a_{crit}}{B} \\right)  \\ge 0 = $$ ',
			Round(r_crit, 3),
			'kPa/kN',
		]);

		R = Math.min(1, Area * (r_crit + (r_max - r_crit) / 3));

		if (jointReaction !== 0) {
			R = Math.min(R * (1 - this.#jointTransfer()) + jointReaction);

			doc.write([
				'Total relative reaction within critical perimeter:',
				'$$ \\dfrac{R_{cp}}{P} = \\frac{1-\\chi}{P} \\int_A r_{cp} \\ dA + \\int_L q_{cp} \\ dL  \\ \\le 1 = $$',
				Round(R * 100, 1),
				'%',
			]);
		} else {
			doc.write([
				'Total relative reaction within critical perimeter:',
				'$$ \\dfrac{R_{cp}}{P} = \\frac{1}{P} \\int_A r_{cp} \\ dA  \\ \\le 1 = $$',
				Round(R * 100, 1),
				'%',
			]);
		}

		return {
			R,
			doc,
		};
	}

	#criticalPerimeter(load: singleLoad | dualLoad | quadLoad, addedRadius: number) {
		// function to calculate critical perimeter of given load

		let r = addedRadius;
		let u: number;
		let doc = new docWriter();

		doc.rowWidth = [20, 25, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let dist_L = load.dist_l;
		let dist_W = load.dist_w;

		if (!load.trueEdge) {
			dist_L = 0;
			dist_W = 0;
		}

		// foot print of a single load
		// how to deal with dual/quad loads with close spacing? combined punching failure
		if (load.position === 'internal') {
			if (load.footprint.shape === 'round') {
				let dia = 2 * (r + load.footprint.r);
				u = dia * Math.PI;

				doc.write(['Critical perimeter:', '$$ u = 2 (a + a_{crit}) \\pi = $$', Round(u, 1), 'mm']);
			} else {
				let dia = 2 * r;
				u = dia * Math.PI + 2 * (load.footprint.w + load.footprint.l);
				doc.write([
					'Critical perimeter:',
					'$$ u = 2 (a_{crit}) \\pi + 2 (l_{p} + w_{p}) = $$',
					Round(u, 1),
					'mm',
				]);
			}
		} else if (load.position === 'edge') {
			if (load.footprint.shape === 'round') {
				let dia = 2 * (r + load.footprint.r);

				let min_dim = Math.min(dist_W, dist_L);

				u = (1 / 2) * dia * Math.PI + 2 * min_dim;
				doc.write(['Critical perimeter:', '$$ u = (a + a_{crit}) \\pi = $$', Round(u, 1), 'mm']);
			} else {
				let dia = 2 * r;

				// find dimensions that give smallest perimeter:
				let min_dim = Math.min(load.footprint.w + dist_W, load.footprint.l + dist_L);
				let max_dim = load.footprint.l;
				if (min_dim === load.footprint.l + dist_L) max_dim = load.footprint.w;

				u = (1 / 2) * dia * Math.PI + 2 * min_dim + max_dim;

				doc.write([
					'Critical perimeter:',
					'$$ u = (a_{crit}) \\pi + (2 l_{p} + w_{p}) = $$',
					Round(u, 1),
					'mm',
				]);
			}
		} else if (load.position === 'corner') {
			if (load.footprint.shape === 'round') {
				let dia = 2 * (r + load.footprint.r);
				u = (1 / 4) * dia * Math.PI + dist_L + dist_W;
				doc.write([
					'Critical perimeter:',
					'$$ u = 0.5 (a + a_{crit}) \\pi = $$',
					Round(u, 1),
					'mm',
				]);
			} else {
				let dia = 2 * r;

				u = (1 / 4) * dia * Math.PI + (dist_W + load.footprint.w) + (dist_L + load.footprint.l);

				doc.write([
					'Critical perimeter:',
					'$$ u = 0.5 (a_{crit}) \\pi + (l_{p} + w_{p}) = $$',
					Round(u, 1),
					'mm',
				]);
			}
		} else {
			console.warn('You shouldnt be here!!');
		}

		return {
			u,
			doc,
		};
	}

	#TR34_Mrd(face: 'top' | 'bot', location: position) {
		// function to calculate moment capacity in accordance with TR34 Method:

		let fibers = this.reinforcement.fibers;

		let t = this.slab.thickness;

		let As: number;
		let cover: number;
		let dia: number;

		let doc = new docWriter();
		doc.rowWidth = [20, 25, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let fyk = this.reinforcement.steel.f_yk as number;
		let fck = this.slab.Concrete.f_ck as number;
		let localReinf = this.reinforcement[location] as localReinforcement;

		let NP = 'P';

		if (face === 'top') {
			dia = localReinf.top_dia;
			As = (((dia ** 2 * Math.PI) / 4) * 1000) / localReinf.top_spacing;
			cover = localReinf.top_cover;
			NP = 'N';
		} else {
			dia = localReinf.bot_dia;
			As = (((dia ** 2 * Math.PI) / 4) * 1000) / localReinf.bot_spacing;
			cover = localReinf.bot_cover;
		}

		let As_mid = (((localReinf.mid_dia ** 2 * Math.PI) / 4) * 1000) / localReinf.mid_spacing;
		let d_mid = t / 2;

		let Ac = t * 1000; // full thickness??!

		let rho = (As + As_mid) / Ac;

		let d = t - cover - dia; // cover to middle of mesh

		//fiber
		let sigma_R1 = (0.45 * fibers.f_R1) as number;
		let sigma_R4 = (0.37 * fibers.f_R4) as number;

		if (rho > 0) {
			doc.write([
				'Reinforcement ratio:',
				'$$ \\rho = \\frac{A_{s}}{A_{c}} = $$',
				Round(100 * rho, 3),
				'%',
			]);
		}
		if (sigma_R1 > 0) {
			doc.write('Post-crack tensile fibre strength:');
			doc.write([
				'At CMOD = 0.5 mm:',
				`$$ \\sigma_{r1} = 0.45 f_{R1} = $$`,
				Round(sigma_R1),
				'MPa',
			]);
			doc.write([
				'At CMOD = 3.5 mm:',
				`$$ \\sigma_{r4} = 0.37 f_{R4} = $$`,
				Round(sigma_R4),
				'MPa',
			]);
		}

		let Mrd = 0;

		if (rho === 0) {
			// d = 0.75 * t; // not used for this actually.
			// doc.push('Fibers only: Effective height \\( d = 0.75 t \\)');

			Mrd = ((t ** 2 / this.gamma.f) * (0.29 * sigma_R4 + 0.16 * sigma_R1)) / 1000;

			doc.write([
				'Fibre-only moment capacity:',
				`$$ M_{${NP},Rd} = \\frac{t^{2}}{\\gamma_{f}} (0.29 \\sigma_{r4} + 0.16 \\sigma_{r1}) = $$`,
				Round(Mrd),
				'kNm/m',
			]);
		} else if (rho <= 0.0015) {
			Mrd =
				(t ** 2 / this.gamma.f) * (0.29 * sigma_R4 + 0.16 * sigma_R1) +
				(As * fyk * (d - 0.048 * t)) / this.gamma.s / 1000 +
				(As_mid * fyk * (d_mid - 0.048 * t)) / this.gamma.s / 1000;

			Mrd /= 1000;

			doc.write([
				'Hybrid reinforcement moment capacity:',
				`$$ M_{${NP},Rd} = \\frac{t^{2}}{\\gamma_{f}} (0.29 \\sigma_{r4} + 0.16 \\sigma_{r1}) \\ + $$` +
					`$$ \\frac{A_{s}f_{yk}}{\\gamma_{s}} (d - 0.048t) = $$`,
				Round(Mrd),
				'kNm/m',
			]);
		} else {
			let x = Math.max(
				0.123 * t,
				Math.min(
					0.9 * t,
					((sigma_R1 + sigma_R4) * t + (2 * fyk * As) / 1000) / (sigma_R4 + sigma_R1 + 1.28 * fck)
				)
			);

			// let sigma_min = Math.min(sigma_R1, sigma_R4)

			doc.write(['Neutral axis:', '$$ x = $$', Round(x, 1), 'mm']);
			Mrd =
				(0.5 * (sigma_R1 - sigma_R4) * (t - x) * (0.28 * x + 0.33 * t)) / this.gamma.f +
				(sigma_R4 * (t - x) * (0.11 * x + 0.5 * t)) / this.gamma.f +
				(((As * fyk) / this.gamma.s) * (d - 0.39 * x)) / 1000 +
				(((As_mid * fyk) / this.gamma.s) * (d_mid - 0.39 * x)) / 1000;

			Mrd /= 1000;

			doc.write([
				'Resulting moment capacity:',
				'$$ M_{Rd} = \\int_{-t/2}^{t/2} \\sigma_c \\, z \\ dz + \\sum_{i=1}^n \\sigma_{s,i} A_{s,i} z_{s,i} = $$',
				Round(Mrd),
				'kNm/m',
			]);
		}

		return {
			value: Mrd,
			doc,
		};
	}

	earlyAgeCracking(q_perm = 0, T_inf = 50 * 365) {
		let doc = new docWriter();

		let thick = this.slab.thickness;
		// load shrinkage object:
		let creep_shrinkage = new EC_CS(this.slab.Concrete, thick * 2, 0.5);

		let nYears = Math.round(T_inf / 365);

		doc.concat(creep_shrinkage.doc);
		doc.writeTitle('Early age cracking:');
		doc.write(`Shrinage at ${nYears} years:  + ${Round(creep_shrinkage.totalShrink(T_inf), 5)}`);

		let jointCrackDepth = 30; // mm
		if (this.slab.joints.cutDepth > 1) this.slab.joints.cutDepth /= 100;

		let thicknessJoint = thick * (1 - this.slab.joints.cutDepth);

		thicknessJoint = Math.max(thicknessJoint - jointCrackDepth, thicknessJoint / 2);

		// base friction
		let f_fric = ((thick / 1000) * this.slab.Concrete.density + q_perm) * this.subbase.friction; // [kN/m2]
		let dist = (Math.max(this.slab.field_length, this.slab.field_width) * 1e-3) / 2; // [m]

		let N_fric = dist * f_fric; // [kN/m]
		let M_fric = (N_fric * 0.5 * thick) / 1000; // [kNm/m]

		let t_plot: number[] = [];
		let sigma_top: number[] = [];
		let sigma_bot: number[] = [];
		let strength_plot: number[] = [];

		let riskOfCracking = false;
		let t_crit = 1e20;

		let step = 1;

		let Rax = 0.5;
		let Smax = dist * 1000;
		let f_Ftsk = this.reinforcement.fibers.f_Ftsk;

		let w = 0;
		for (let t = 3; t < T_inf; t += step) {
			// tensile strength at given time:
			let fctm = this.slab.Concrete.f_ctm_time(t); // [MPa]

			// restraint force at joints:
			let N_edge = thicknessJoint * fctm; // [kN/m]
			let M_edge = ((N_edge * (thick / 2 - thicknessJoint / 2)) / 1000) * 0; // [kNm/m]

			//tensile strength:
			let strength = 0.7 * fctm;

			// restraint limited by actual EA strain:
			// let sigma_max = creep_shrinkage.totalShrink(t) * this.slab.Concrete.E_cm_time(t) * 0.65;

			let Ec = this.slab.Concrete.E_cm_time(t) * 1.05; // tangent stiffness
			let phi = creep_shrinkage.creep(t);

			let sigma_max = (0.5 * (creep_shrinkage.totalShrink(t) * Ec)) / (1 + phi);
			// console.log('sigma_max = ' + sigma_max);
			// console.log('fctk  = ' + strength);

			// stress: top [MPa]
			let sigma_t = Math.min(
				sigma_max,
				(N_fric + N_edge) / thick - ((M_edge + M_fric) * 1e3 * 6) / thick ** 2
			);
			// stress: bot [MPa]
			let sigma_b = Math.min(
				sigma_max,
				(N_fric + N_edge) / thick + ((M_edge + M_fric) * 1e3 * 6) / thick ** 2
			);

			// let eps_cr = Rax * creep_shrinkage.totalShrink(t) - (f_Ftsk / Ec) * (1 + phi);
			let eps_cr =
				Rax * creep_shrinkage.totalShrink(t) -
				(0.4 * this.slab.Concrete.f_ctm_time(t)) / (Ec / (1 + phi));

			w = eps_cr * Smax;

			// plot to arrays:
			t_plot.push(t);
			sigma_top.push(w);
			// sigma_top.push(sigma_t;
			// sigma_bot.push(sigma_b);
			sigma_bot.push(0);
			strength_plot.push(strength);
			// strength_plot.push(0);

			// check if cracked:
			if (sigma_t > strength || sigma_b > strength) {
				t_crit = Math.min(t_crit, t);
				riskOfCracking = true;
			}
			step = Math.pow(Math.max(1, t / 28), 1.5);
		}

		if (riskOfCracking) {
			doc.write('Risk of early age cracking at t=' + t_crit + ' days');
		} else {
			doc.write('No risk of early age cracking!');
		}
		// console.log('wk = ' + Round(w, 2) + 'mm');

		// console.log('concrete class ' + this.slab.Concrete.class + ' / RH =' + this.slab.Concrete.RH);
		// console.log('drying at 50yr: ' + creep_shrinkage.dryingShrink(50 * 365));
		// console.log('autogen at 50yr: ' + creep_shrinkage.autogeniousShrink(50 * 365));
		// console.log('total shrink at 50yr: ' + creep_shrinkage.totalShrink(50 * 365));
		// console.log('total creep fact at 50yr: ' + creep_shrinkage.creep(50 * 365));

		return {
			riskOfCracking: true,
			t_plot,
			sigma_top,
			sigma_bot,
			strength_plot,
			doc: doc,
		};
	}

	checkGeometry(slab = this.slab, fibers = this.reinforcement.fibers) {
		// Function to check geometry against recommendations to avoid shrinkage cracks.

		this.riskOfCracking = false;

		let doc = new docWriter();
		doc.style = {
			// color: 'red',
			'font-style': 'italic',
		};

		// Dimmensions of slab/fields
		let L = Math.max(slab.length, slab.width) / 1000;
		let W = Math.min(slab.length, slab.width) / 1000;
		let t = slab.thickness;

		if (slab.withJoints) {
			L = Math.max(slab.field_length, slab.field_width) / 1000;
			W = Math.min(slab.field_length, slab.field_width) / 1000;
		}

		let ratio = Round(L / W, 1);
		let diagonal = Math.sqrt(L ** 2 + W ** 2);

		// set limit:
		let limit = 6 * Math.sqrt(2);
		if (t >= 120 && fibers.f_R1 >= 1.5) limit = 8 * Math.sqrt(2);

		// console.log('dia = ' + dia);
		// console.log('limit = ' + limit);

		doc.lineBreak();
		if (ratio > 1.5) {
			doc.write(
				`NOTE: Current field aspect ratio of 1:${ratio} is greater than the recommended limit of 2:3`
			);
			doc.write(`This may cause issues with shrinkage cracks`);
			this.riskOfCracking = true;
		}

		if (t < 100) {
			doc.write(
				'NOTE: Slab thickness below 100mm is not recommended. Precausions should be taken to avoid shrinkage issues'
			);
			this.riskOfCracking = true;
		} else if (diagonal > limit) {
			doc.write('NOTE: Current field size and thickness may cause issues with shrinkage cracks.');
			doc.write('Precausions should be taken, such as:');

			if (!slab.withJoints) {
				doc.write('- Consideration of joints');
			} else {
				doc.write('- Reduce distance between joints');
			}

			doc.write('- Use of curing compound');
			// doc.write('- Casting at night');
			doc.write('- Covering the wet concrete with plastic sheets');
			doc.write('- Use of shrinkage reducing admixtures');
			doc.write('- Reinforcement to limit crack widths');

			this.riskOfCracking = true;
		}

		// if (doc.length > 0 && fibers.f_R1 > 0) {
		// 	if (fibers.manufacturer === 'ADFIL') {
		// 		doc.write('');
		// 		doc.write(
		// 			'Contact your local ADFIL fiber distributor for assistance to ensure a good result: https://www.adfil.com/contact-us/preferred-partners/'
		// 		);
		// 	}
		// }

		return doc;
	}

	shrinkageCracking(T_inf = 50 * 365) {
		let doc = new docWriter();
		let short_doc = new docWriter();

		doc.writeTitleTwo('Shrinkage Calculations', true);
		short_doc.writeTitleTwo('Shrinkage Calculations', true);
		short_doc.write('Summary of results');
		let thick = this.slab.thickness;
		// load shrinkage object:
		let creep_shrinkage = new EC_CS(this.slab.Concrete, thick * 2, 0.5);
		doc.concat(creep_shrinkage.doc);

		let nYears = Math.round(T_inf / 365);

		let eps_sh = creep_shrinkage.totalShrink(T_inf);

		doc.rowWidth = [20, 30, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];
		doc.lineBreak();
		doc.write([
			`Total shrinkage at \\( t = ${nYears} \\) years:`,
			'$$ \\varepsilon_{cs} = \\varepsilon_{cd} + \\varepsilon_{ca} = $$',
			Round(eps_sh * 1000, 3),
			'‰',
		]);

		short_doc.push(doc.lastEntry);

		let w_k = 0;
		doc.lineBreak();
		doc.writeTitle('Crack width calculations');

		if (this.riskOfCracking) {
			let k_t = 0.4;
			let Rax = 0.75;

			let fct = this.slab.Concrete.f_ctm;
			let Ecm = this.slab.Concrete.E;

			let eps_cr = Math.max(0, Rax * eps_sh - (k_t * fct) / Ecm);

			doc.write(['Restraint factor', '$$ R_{ax} = $$', Rax]);
			doc.write(['Time coefficient:', '$$ k_t = $$', k_t]);
			doc.write([
				'Crack producing strain:',
				'$$ ( \\varepsilon_{cm} - \\varepsilon_{sm} ) = R_{ax} \\varepsilon_{cs} - k_t \\frac{f_{ct,eff}}{E_{cm}} = $$',
				Round(eps_cr * 1000, 3),
				'‰',
			]);
			short_doc.push(doc.lastEntry);

			let upperLimit = Math.max(this.slab.length, this.slab.width) / 2; // [m]
			if (this.slab.withJoints)
				upperLimit = Math.max(this.slab.field_length, this.slab.field_width) / 2;
			let Smax: number;

			let reinf = this.reinforcement.internal;
			let cover_top = reinf.top_cover;
			let cover_bot = reinf.bot_cover;

			let As_top = (((reinf.top_dia ** 2 * Math.PI) / 4) * 1000) / reinf.top_spacing;
			let As_bot = (((reinf.bot_dia ** 2 * Math.PI) / 4) * 1000) / reinf.bot_spacing;
			let As_mid = (((reinf.mid_dia ** 2 * Math.PI) / 4) * 1000) / reinf.mid_spacing;
			let As_total = As_mid + As_top + As_bot;

			let hct_top = Math.min(thick / 2, 2.5 * (cover_top + reinf.top_dia / 2));
			let hct_bot = Math.min(thick / 2, 2.5 * (cover_bot + reinf.bot_dia / 2));
			let hct_mid = thick;

			let rho_top = As_top / (hct_top * 1000);
			let rho_bot = As_bot / (hct_bot * 1000);
			let rho_total = As_total / (hct_mid * 1000);

			let rho: number;
			let cover: number;
			let h_ct: number;
			let dia: number;

			if (rho_total > rho_top && rho_total > rho_bot) {
				doc.write('Through-going cracks critical');
				rho = rho_total;

				if (reinf.top_dia * reinf.bot_dia > 0) {
					cover = Math.max(cover_bot, cover_top);
				} else {
					cover = thick / 2 - reinf.mid_dia;
				}

				h_ct = hct_mid;

				let n_top = 1000 / reinf.top_spacing;
				let n_bot = 1000 / reinf.bot_spacing;
				let n_mid = 1000 / reinf.mid_spacing;

				//effective dia:
				dia =
					(n_top * reinf.top_dia ** 2 + n_bot * reinf.bot_dia ** 2 + n_mid * reinf.mid_dia ** 2) /
					(n_top * reinf.top_dia + n_bot * reinf.bot_dia + n_mid * reinf.mid_dia);

				doc.write([
					'Effective Tensile zone height',
					`$$ h_{ct,eff} = t = $$ `,
					Round(h_ct, 1),
					'mm',
				]);
			} else if (rho_bot < rho_top) {
				doc.write('Bottom face critical');
				rho = rho_bot;
				cover = cover_bot;
				h_ct = hct_bot;
				dia = reinf.bot_dia;

				doc.write([
					'Effective Tensile zone height',
					`$$ h_{ct,eff} = \\min \\left[ \\frac{t}{2} , \\ 2.5 \\left( c + \\frac{ø}{2} \\right) \\right] = $$ `,
					Round(h_ct, 1),
					'mm',
				]);
			} else {
				doc.write('Top face critical');
				rho = rho_top;
				cover = cover_top;
				h_ct = hct_top;
				dia = reinf.top_dia;

				doc.write([
					'Effective Tensile zone height',
					`$$ h_{ct,eff} = \\min \\left[ \\frac{t}{2} , \\ 2.5 \\left( c + \\frac{ø}{2} \\right) \\right] = $$ `,
					Round(h_ct, 1),
					'mm',
				]);
			}

			doc.write([
				'Reinforcement ratio',
				`$$ \\rho = \\frac{A_s}{A_{ct,eff}} = $$ `,
				Round(rho * 100, 3),
				'%',
			]);

			if (rho === 0 && this.reinforcement.fibers.f_Ftsk < this.slab.Concrete.f_ctm) {
				Smax = 1e20;

				// if strain hardening with fibres only???
			} else {
				if (this.reinforcement.fibers.f_Ftsk === 0) {
					let k1 = 0.8;
					let k2 = 1.0; //!!! pure tension??
					let k3 = 3.4;
					let k4 = 0.425;

					if (this.parameters.NationalAnnex === 'DK NA') {
						k3 = 3.4 * Math.pow(25 / cover, 2 / 3);
					}

					doc.rowWidth = [20, 10, 10, 10, 10];
					doc.allignChildren = ['center', 'center', 'center', 'center', 'center'];

					doc.write('Crack coefficients:');
					doc.write([
						'',
						`$$ k_1 = ${Round(k1, 3)} $$`,
						`$$ k_2 = ${Round(k2, 3)} $$`,
						`$$ k_3 = ${Round(k3, 3)} $$`,
						`$$ k_4 = ${Round(k4, 3)} $$`,
					]);

					Smax = k3 * cover + (k1 * k2 * k4 * dia) / rho;
					doc.rowWidth = [20, 30, 5, 5, 5];
					doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];
					doc.write([
						'Maximum crack spacing',
						`$$ S_{max} = k_3 c + k_1 k_2 k_4 \\frac{ø}{\\rho} = $$ `,
						Round(Smax, 1),
						'mm',
					]);
				} else {
					// with fibres:

					if (this.reinforcement.fibers.f_Ftsk >= this.slab.Concrete.f_ctm) {
						Smax = this.reinforcement.fibers.l_f + thick;

						doc.write(['Strain hardening behavior:', `$$ f_{Fts} \\ge f_{ctm} $$`]);
						doc.write([
							'Maximum crack spacing limit by fibre length and slab thickness',
							`$$ S_{max} = l_{F} + t = $$`,
							Round(Smax, 1),
							'mm',
						]);
					} else {
						Smax = Math.max(
							this.reinforcement.fibers.l_f,
							(2 * cover + (0.28 * dia) / rho) *
								(1 - this.reinforcement.fibers.f_Ftsk / this.slab.Concrete.f_ctm)
						);

						doc.write([
							'Maximum crack spacing',
							`$$ S_{max} = \\max \\left[ l_{F} , \\ \\left( 2 c + 0.28 \\frac{ø}{\\rho} \\right) \\left( 1 - \\frac{f_{Fts}}{f_{ctm}} \\right) \\right]	=$$ `,
							Round(Smax, 1),
							'mm',
						]);
					}
				}
			}

			if (Smax > upperLimit) {
				Smax = upperLimit;
				let subscript = '';

				if (this.slab.withJoints) subscript = '_f';

				doc.write([
					'Crack spacing limited by geometry:',
					`$$ S_{max} = \\frac{1}{2} \\max \\left( l${subscript} , \\ w${subscript}  \\right) = $$ `,
					Round(Smax, 1),
					'mm',
				]);
			}
			short_doc.push(doc.lastEntry);

			w_k = Math.min(999, Smax * eps_cr);
			let outArr = [
				'Maximum crack width:',
				'$$ w_k = S_{max} ( \\varepsilon_{cm} - \\varepsilon_{sm} ) = $$',
				Round(w_k, 2),
				'mm',
			];
			doc.write(outArr);

			if (w_k > this.parameters.crack_limit + 0.0049) short_doc.style = { color: '#dc3545' };
			short_doc.write(outArr);
			short_doc.style = {};
		} else {
			doc.write('Shrinkage cracks not expected with current dimensions');
			short_doc.push(doc.lastEntry);
			w_k = 0;
			doc.write(['Maximum crack width:', '$$ w_k = $$', Round(w_k, 2), 'mm']);
		}

		doc.write(['Design crack width:', '$$ w_{cr} = $$', this.parameters.crack_limit, 'mm']);

		let UR = Round(w_k / (this.parameters.crack_limit + 0.0049), 2);

		doc.style = { 'font-style': 'italic' };
		if (UR > 1) {
			doc.write(['', '', '', 'Not OK!']);
		} else {
			doc.write(['', '', '', 'OK!']);
		}

		if (this.parameters.NationalAnnex === 'DK NA') {
			let sqrFormula = this.sqRootForm();
			doc.lineBreak();
			doc.concat(sqrFormula.doc);
			if (sqrFormula.UR.worst > 1) {
				short_doc.write('Does not adhere to DK-NA minimum reinforcement requirements');
			} else {
				short_doc.write('Conforms to DK-NA minimum reinforcement requirements');
			}
		}
		return {
			doc,
			short_doc,
			UR,
		};
	}

	sqRootForm() {
		let doc = new docWriter();
		doc.writeTitle('Minimum reinforcement according to DK-NA');

		doc.rowWidth = [20, 30, 5, 5, 5];
		doc.allignChildren = ['left', 'left', 'center', 'right', 'left'];

		let fct = 0.5 * Math.sqrt(0.1 * this.slab.Concrete.f_ck);

		doc.write([
			'Effective tensile strength',
			'$$ f_{ct,eff} = 0.5 \\sqrt{0.1 f_{ck} } = $$',
			Round(fct, 2),
			'MPa',
		]);

		let reinf = this.reinforcement.internal;
		let Es = this.reinforcement.steel.E_s;

		let cover_top = reinf.top_cover;
		let cover_bot = reinf.bot_cover;

		let As_top = (((reinf.top_dia ** 2 * Math.PI) / 4) * 1000) / reinf.top_spacing;
		let As_bot = (((reinf.bot_dia ** 2 * Math.PI) / 4) * 1000) / reinf.bot_spacing;

		let As_mid = (((reinf.mid_dia ** 2 * Math.PI) / 4) * 1000) / reinf.mid_spacing;

		let As_total = As_top + As_bot + As_mid;

		let hct_top = 2 * (cover_top + reinf.top_dia / 2);
		let hct_bot = 2 * (cover_bot + reinf.bot_dia / 2);

		let rho_top = As_top / (hct_top * 1000);
		let rho_bot = As_bot / (hct_bot * 1000);

		let rho_total = As_total / (this.slab.thickness * 1000);

		let wk = this.parameters.crack_limit;

		let dia_top = reinf.top_dia;
		let dia_bot = reinf.bot_dia;
		let dia_mid = reinf.mid_dia;

		let onlyCoarse = false;

		let k = 1;

		let R = 1;
		let R_str = '';
		if (this.reinforcement.fibers.f_Ftsk > 0) {
			R = Math.max(0, 1 - this.reinforcement.fibers.f_Ftsk / this.slab.Concrete.f_ctm);
			R_str = '\\cdot R_F';
			doc.write([
				'Fiber crack spacing reduction factor',
				'$$ R_F = \\left( 1 - \\frac{f_{Fts}}{f_{ctm}} \\right) = $$',
				Round(R, 2),
				'',
			]);
		}

		let dia = dia_top;

		let UR = { top: 0, bot: 0, mid: 0, worst: 0 };

		if (dia_top > 0) {
			// check top side:
			dia = dia_top;
			doc.lineBreak();
			doc.write('Top face surface cracks:');
			doc.write(['Top reinforcement diameter', '$$ ø_{top} = $$', dia_bot, 'mm']);
			doc.write(['Effective tensile zone', '$$ A_{ct,eff} = $$', Round(hct_top * 1000, 1), 'mm²']);
			doc.write(['Fine crack system', '$$ k = $$', k, '']);

			let rho_min = Math.sqrt((dia * fct) / (4 * Es * k * wk)) * R;
			doc.write([
				'Minimum reinforcement ratio',
				`$$ \\rho_{min} = \\sqrt{ \\frac{ø f_{ct,eff} }{4 E_{s} \\ k \\ w_k }  } ${R_str} = $$`,
				Round(rho_min * 100, 2),
				'%',
			]);

			doc.write([
				'Top reinforcement ratio',
				'$$  \\rho_{top} = \\frac{A_s}{A_{ct,eff} } = $$',
				Round(rho_top * 100, 2),
				'%',
			]);

			UR.top = Round(rho_min / rho_top, 3);
		}

		if (dia_bot > 0) {
			// check Bottom side:
			dia = dia_bot;
			doc.lineBreak();
			doc.write('Bottom face surface cracks:');
			doc.write(['Bottom reinforcement diameter', '$$ ø_{bot} = $$', dia_bot, 'mm']);
			doc.write(['Effective tensile zone', '$$ A_{ct,eff} = $$', Round(hct_bot * 1000, 1), 'mm²']);

			k = 1;
			doc.write(['Fine crack system', '$$ k = $$', k, '']);
			let rho_min = Math.sqrt((dia * fct) / (4 * Es * k * wk)) * R;

			doc.write([
				'Minimum reinforcement ratio',
				`$$ \\rho_{min} = \\sqrt{ \\frac{ø f_{ct,eff} }{4 E_{s} \\ k \\ w_k }  } ${R_str} = $$`,
				Round(rho_min * 100, 2),
				'%',
			]);

			doc.write([
				'Bottom reinforcement ratio',
				'$$  \\rho_{bot} = \\frac{A_s}{A_{ct,eff} }	= $$',
				Round(rho_bot * 100, 2),
				'%',
			]);

			UR.bot = Round(rho_min / rho_bot, 3);
		}

		let n_top = 1000 / reinf.top_spacing;
		let n_bot = 1000 / reinf.bot_spacing;
		let n_mid = 1000 / reinf.mid_spacing;

		//effective dia:
		dia =
			(n_top * dia_top ** 2 + n_bot * dia_bot ** 2 + n_mid * dia_mid ** 2) /
			(n_top * dia_top + n_bot * dia_bot + n_mid * dia_mid);

		if (dia > 0) {
			doc.lineBreak();
			doc.write('Through-going cracks:');
			doc.write(['Effective reinforcement diameter', '$$ ø_{eff} = $$', Round(dia, 2), 'mm']);
			doc.write([
				'Effective tensile zone',
				'$$ A_{ct,eff} = $$',
				Round(this.slab.thickness * 1000, 1),
				'mm²',
			]);

			k = 2;
			doc.write(['Coarse crack system', '$$ k = $$', k, '']);

			let rho_min = Math.sqrt((dia * fct) / (4 * Es * k * wk)) * R;

			doc.write([
				'Minimum reinforcement ratio',
				`$$ \\rho_{min} = \\sqrt{ \\frac{ø f_{ct,eff} }{4 E_{s} \\ k \\ w_k }  } ${R_str} = $$`,
				Round(rho_min * 100, 2),
				'%',
			]);

			doc.write([
				'Reinforcement ratio',
				'$$  \\rho = \\frac{A_s}{A_{ct,eff} } = $$',
				Round(rho_total * 100, 3),
				'%',
			]);

			UR.mid = Round(rho_min / rho_total, 3);
		}

		UR.worst = Math.max(UR.top, UR.bot, UR.mid, UR.worst);
		if (UR.worst === 0) UR.worst = 2;

		if (UR.worst > 1.0049) {
			// doc.style = { color: 'orange' };
			doc.style = { 'font-style': 'italic' };

			doc.write([
				'',
				'Minimum reinforcement not supplied - shrinkage cracks may be an issue',
				'',
				'',
			]);
		}

		return {
			doc,
			UR,
		};
	}
}

// export function Round(number: number, digits = 2) {
// 	return Math.round((number + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits);
// }

function convertNearPerimeter(
	load: singleLoad | dualLoad | quadLoad,
	position: 'corner' | 'edge',
	crit_dist: number
) {
	if (position === 'corner') {
		if (load.type === 'dual' && load.load_dist_x > crit_dist) {
			// for dual, only considerd 1 wheel if axis is greater than l+a:

			var newLoad = convertLoad(load, 'single', position);
		} else if (
			load.type === 'quad' &&
			((load.load_dist_x > crit_dist && load.load_dist_y <= crit_dist) ||
				(load.load_dist_x <= crit_dist && load.load_dist_y > crit_dist))
		) {
			// one (and only one) distance is greater than l+a, thus quad is converted to dual:
			var newLoad = convertLoad(load, 'dual', position);
		} else if (
			load.type === 'quad' &&
			Math.sqrt(load.load_dist_x ** 2 + load.load_dist_y ** 2) > crit_dist
		) {
			// if diagonal is greater than limit: convert to single load:

			var newLoad = convertLoad(load, 'single', position);
		} else {
			// else, just add at corner:
			var newLoad = { ...load };
		}
	} else if (position === 'edge') {
		if (load.type === 'quad' && load.load_dist_x > crit_dist && load.load_dist_y > crit_dist) {
			// if quad dist is greater than limit: convert to edge dual load:

			var newLoad = convertLoad(load, 'dual', position);
		} else {
			// else, just add at corner:
			var newLoad = { ...load };
		}
	}

	newLoad.position = position;
	return newLoad;
}

function combinedSmallLoads(
	load: singleLoad | dualLoad | quadLoad,
	minDist: number,
	radiusOfRelative: number
) {
	let origName = String(load.name);
	let origType = String(load.type);
	let reason = 'Load distances too small';

	if (load.type === 'quad') {
		//Quad
		let max = Math.max(load.load_dist_x, load.load_dist_y);
		let min = Math.min(load.load_dist_x, load.load_dist_y);

		if (min < minDist) {
			// convert to dual
			let new_dist = max;
			let newL = min + load.eq_radius;
			let newW = 2 * load.eq_radius;

			let Area = newL * newW;
			let eqRad = Math.sqrt(Area / Math.PI);

			let newLoad = {
				name: origName + ' - equiv. Dual',
				note: `${reason}: converted from Quad- to Dual-load`,
				type: 'dual',
				P: load.P,
				PunchingLoad: 0,
				position: load.position,
				trueEdge: load.trueEdge,
				footprint: { shape: 'square', l: newL, w: newW },
				load_dist_x: new_dist,
				dist_w: load.dist_w,
				dist_l: load.dist_l,
				eq_radius: eqRad,
				atJoints: load.atJoints,
			} as dualLoad;
			load = newLoad;
		}
	}

	if (load.type === 'dual' && load.load_dist_x < minDist) {
		//combine to single
		let newL = load.load_dist_x + load.eq_radius;
		let newW = 2 * load.eq_radius;
		let Area = newL * newW;
		let eqRad = Math.sqrt(Area / Math.PI);

		let newLoad = {
			name: origName + ' - equiv. single',
			note: `${reason}: converted from ${origType}- to Single-load`,
			type: 'single',
			P: load.P,
			PunchingLoad: 0,
			position: load.position,
			trueEdge: load.trueEdge,
			footprint: { shape: 'square', l: newL, w: newW },
			dist_w: load.dist_w,
			dist_l: load.dist_l,
			eq_radius: eqRad,
			atJoints: load.atJoints,
		} as singleLoad;
		load = newLoad;
	}

	// convert small dual- and quad-load to single- or dual if load distances are small enough:
	// console.log('load:' + load.name + ' rad=' + load.eq_radius + ' l=' + radiusOfRelative);
	if (load.eq_radius >= radiusOfRelative) {
		let Area = load.eq_radius ** 2 * Math.PI * 1e-6; // m2

		let newLoad = {
			name: origName + ' - equiv. UDL',
			note: 'Too large load area: Converted to equiv. UDL',
			type: 'uniform',
			P: Round(load.P / Area, 3),
			PunchingLoad: '',
		} as uniformLoad;
		return newLoad;
	}

	return load;
}

function convertLoad(
	load: singleLoad | quadLoad | dualLoad,
	to: 'dual' | 'quad' | 'single',
	position: 'edge' | 'corner',
	reason = 'Load distance large'
) {
	// down covert load to only consider part of original load.

	let source = 4;
	let from = load.type;
	if (from === 'dual') source = 2;
	if (from === 'single') source = 1;

	let destination = 4;
	if (to === 'dual') destination = 2;
	if (to === 'single') destination = 1;

	let factor = destination / source;

	// console.log('from:' + from + ' to:' + to + ' factor=' + factor);
	if (factor >= 1) {
		throw 'Error: convertion not possible';
	}

	let newLoad = {
		name: load.name + '-' + to,
		note: `${reason}: converted from ${from}- to ${to}-load at ${position}`,
		type: to,
		P: load.P * factor,
		PunchingLoad: 0,
		position: position,
		trueEdge: true,
		footprint: { ...load.footprint },
		dist_w: load.dist_w,
		dist_l: load.dist_l,
		eq_radius: load.eq_radius,
		atJoints: load.atJoints,
	} as singleLoad | dualLoad | quadLoad;

	if (newLoad.type === 'dual' && load.type === 'quad') {
		newLoad.load_dist_x = Math.min(load.load_dist_x, load.load_dist_y);
	}

	return newLoad;
}

// TYPES:
type position = 'internal' | 'edge' | 'corner' | 'any' | '';

type LooseObject = {
	[key: string]: any;
};

export type slab = {
	thickness: number;
	width: number;
	length: number;

	Concrete: EC_Concrete;
	// joint details:
	withJoints: boolean;
	field_width: number;
	field_length: number;
	joints: jointtypes;
};

export type jointtypes =
	| { type: 'Saw Cut'; name: 'Saw-cut'; cutDepth: number }
	| { type: 'Custom'; name: string; transfer: number; cutDepth: number };

export type subbase = {
	doc: docWriter;
	k: number;
	friction: number;
	insulation_layers: insulationLayer[];
};

type insulationLayer = {
	name: string;
	thickness: number;
	factor: number;
	EDP_A1A3: number;
	EPD_A1D: number;
	EPD_link: string;
};

type slabReinforcement = {
	//fibers:
	fibers: structural_fibers;
	//conventional:
	steel: Steel;
	internal: localReinforcement;
	edge: localReinforcement;
	corner: localReinforcement;
};

type localReinforcement = {
	top_dia: number;
	top_spacing: number;
	top_cover: number;

	mid_dia: number;
	mid_spacing: number;

	bot_dia: number;
	bot_spacing: number;
	bot_cover: number;
};

export type slabParameters = {
	Code: 'TR34' | 'EN1992';
	NationalAnnex: string; // Nation annex choixes
	crack_limit: number; // Design crack width - for SLS only
};

// load types:
export type generalLoad = uniformLoad | lineLoad | singleLoad | dualLoad | quadLoad;

type uniformLoad = {
	name: string;
	note: string;
	type: 'uniform';
	position: 'internal';
	P: number;
	PunchingLoad: '';
};

type lineLoad = {
	name: string;
	note: string;
	type: 'line';
	P: number;
	position: 'internal' | 'edge';
	dist_x: number;
	PunchingLoad: '';
};

type squareFootprint = {
	shape: 'square';
	w: number;
	l: number;
};

type roundFootprint = {
	shape: 'round';
	r: number;
};

type singleLoad = {
	name: string;
	note: string;
	type: 'single';
	P: number;
	PunchingLoad: number;
	position: position;
	trueEdge: boolean;
	footprint: squareFootprint | roundFootprint;
	dist_w: number;
	dist_l: number;
	eq_radius: number;
	atJoints: boolean;
};

type dualLoad = {
	name: string;
	note: string;
	type: 'dual';
	P: number;
	PunchingLoad: number;
	load_dist_x: number;
	position: position;
	trueEdge: boolean;
	dist_w: number;
	dist_l: number;
	footprint: squareFootprint | roundFootprint;
	eq_radius: number;
	atJoints: boolean;
};

type quadLoad = {
	name: string;
	note: string;
	type: 'quad';
	P: number;
	PunchingLoad: number;
	load_dist_x: number;
	load_dist_y: number;
	position: position;
	trueEdge: boolean;
	footprint: squareFootprint | roundFootprint;
	dist_w: number;
	dist_l: number;
	eq_radius: number;
	atJoints: boolean;
};

// test inferance types:
// type PositiveNumber<T extends number> = number extends T
// 	? never
// 	: `${T}` extends `-${string}`
// 	? never
// 	: T;

// type NonNegativeInteger<T extends number> = number extends T
// 	? never
// 	: `${T}` extends `-${string}` | `${string}.${string}`
// 	? never
// 	: T;

// function SqRoot<N extends number>(x: PositiveNumber<N>): number {
// 	return Math.sqrt(x);
// }

// let test = SqRoot(1);

// const X =  2;	// doesnt work with 'let'

// test = SqRoot(X);

// function AddOne(x: number) {
// 	return x + 1;
// }

// test = AddOne(X);

// type NonZero<T extends number> = T extends 0 ? never : number extends T ? never : T

// const division = <
//     A extends number,
//     B extends number
// >(a: A, b: NonZero<B>) =>
//     a / b

// const X1 = 1
// division(0, X1*2) // ok - doesnt work with arithmatic!
// division(10, X1) // error
