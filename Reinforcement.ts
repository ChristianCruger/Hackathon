// Create reinforcement class with the nessesary information about the rebar:
import { Rectangular, Circular, T_section } from './sectionTypes.js';
import { Steel } from './materials.js';
import { opWr_text, opWr } from './helper_functions.js';
// include more section types as they are finished!

type Geometry = Rectangular | Circular | T_section;

// Input formats for reinforcement:
type Rectangular_reinf = {
	Type: 'Rectangular';
	Material: Steel;
	layers: number[];
	bar_dia: number[];
	bar_spacing: number[];
	spec_space: number[]; // Possible explicitly defined free space between layers
	cover_layer_bot: number;
	cover_layer_top: number;
	stirr_dia: number;
	stirr_legs: number;
	stirr_spacing: number;
};

type Circular_reinf = {
	Type: 'Circular';
	Material: Steel;
	nlayers: number;
	bar_dia: number[];
	n_bar: number[];
	cover: number[];
	theta_0: number;
	stirr_dia: number;
	stirr_legs: number;
	stirr_spacing: number;
};

type Rectangular__indiv_reinf = {
	Type: 'Rectangular_i';
	Material: Steel;
	nlayers_top: number;
	nlayers_bot: number;
	n_bar_top: number[];
	n_bar_bot: number[];
	bar_dia_top: number[];
	bar_dia_bot: number[];
	cover_top: number[];
	cover_bot: number[];
	stirr_dia: number;
	stirr_legs: number;
	stirr_spacing: number;
};

export class Reinforcement {
	// content:
	Type: any;
	stirr_cov_top: number;
	stirr_cov_bot: number;
	output: string[];
	Material: Steel;

	A_s: number[];
	d_s: number[];
	z_s: number[];
	y_s: number[];
	E_s: number[];
	dia: number[];
	n_bar: number[];

	// Shear reinf:
	dia_shear: number;
	spacing_shear: number;
	A_sw: number;
	shearMaterial: Steel;

	outer_dia_top: number;
	outer_dia_bot: number;
	d_top: number;
	d_bot: number;
	outer_spacing_top: number;
	outer_spacing_bot: number;
	cover_layer_top: number;
	cover_layer_bot: number;

	constructor(
		Geometry: Geometry,
		Input: Rectangular_reinf | Circular_reinf | Rectangular__indiv_reinf
	) {
		// Create needed reinforcement object from Reinforcement type input object:
		this.Type = Input.Type;

		if (Input.Type === 'Rectangular') {
			// Regular slab type reinforcement:
			// check if there is reinforcement:
			var n_s = 0;
			if (Input.bar_spacing !== undefined) {
				n_s = Input.bar_spacing.length;
			}

			this.stirr_cov_top = Input.cover_layer_top;
			this.stirr_cov_bot = Input.cover_layer_bot;

			// increase cover layer if stirrups:
			Input.cover_layer_bot += Input.stirr_dia;
			Input.cover_layer_top += Input.stirr_dia;

			let n_bar_exact: number[] = []; // num of bars per layer
			let n_bar_i: number[] = [];
			var n_bar: number[] = [];
			let dy0: number[] = [];
			for (let i = 0; i <= n_s - 1; i++) {
				n_bar_exact.push(Geometry.width / Input.bar_spacing[i]);
				n_bar_i.push(Math.floor(Geometry.width / (0.001 + Input.bar_spacing[i])) + 1);
				dy0.push(-((n_bar_i[i] - 1) * Input.bar_spacing[i]) / 2);
			}

			var layer_idx = new Map<number, number>([]); // map to match layer id with index in arrays
			for (let i = 0; i <= n_s - 1; i++) {
				layer_idx.set(Input.layers[i], i);
			}

			var A_s: number[] = [];
			var d_s: number[] = [];
			var z_s: number[] = []; // reinf layer coordinates
			var y_s: number[] = [];
			var E_s: number[] = []; // reinf. elastic modulus [MPa]
			var dia: number[] = [];

			let A_s_top = 0; // sum of area in top face
			let A_s_bot = 0; //             -- bop face
			let S_top = 0;
			let S_bot = 0;

			let ds_layer = [];

			for (let i = 0; i <= n_s - 1; i++) {
				for (let j = 0; j < n_bar_i[i]; j++) {
					let As = ((Math.PI * Math.pow(Input.bar_dia[i], 2)) / 4) * (n_bar_exact[i] / n_bar_i[i]); // equivalent area

					let ds = 0;
					if (Input.layers[i] == 1) {
						ds = Geometry.height - Input.cover_layer_bot - Input.bar_dia[i] / 2;
					} else if (Input.layers[i] == -1) {
						ds = Input.cover_layer_top + Input.bar_dia[i] / 2;
					} else {
						// this part is pretty ugly, refactor later!!
						let prev_layer = layer_idx.get(Input.layers[i] - Math.sign(Input.layers[i]));
						let layer_space_i = Math.max(Input.spec_space[i], Input.bar_dia[prev_layer]);
						ds =
							ds_layer[prev_layer] -
							Math.sign(Input.layers[i]) *
								(layer_space_i + Input.bar_dia[prev_layer] / 2 + Input.bar_dia[i] / 2);
					}

					d_s.push(ds);
					dia.push(Input.bar_dia[i]);
					A_s.push(As);
					z_s.push(Geometry.height - ds - Geometry.ref_z);
					y_s.push(dy0[i] + j * Input.bar_spacing[i]);
					E_s.push(Input.Material.E_s);
					n_bar.push(1);

					if (Input.layers[i] > 0) {
						A_s_bot += As;
						S_bot += As * ds;
					} else {
						A_s_top += As;
						S_top += As * ds;
					}
				}

				ds_layer.push(d_s[d_s.length - 1]);
			}

			var d_top = S_top / A_s_top;
			var d_bot = S_bot / A_s_bot;

			var outer_dia_top = 0;
			var outer_dia_bot = 0;
			var outer_spacing_top = 0;
			var outer_spacing_bot = 0;
			var cover_layer_top = Input.cover_layer_top;
			var cover_layer_bot = Input.cover_layer_bot;

			// check if there is reinforcement:
			if (Input.bar_spacing !== undefined) {
				outer_dia_top = Input.bar_dia[layer_idx.get(-1)];
				outer_dia_bot = Input.bar_dia[layer_idx.get(1)];
				outer_spacing_top = Input.bar_spacing[layer_idx.get(-1)];
				outer_spacing_bot = Input.bar_spacing[layer_idx.get(1)];
			}

			// output section start:
			this.output = [];

			let include_steel_top = false;
			let include_steel_bottom = false;
			let include_stirrups = false;
			if (outer_dia_top > 0) include_steel_top = true;
			if (outer_dia_bot > 0) include_steel_bottom = true;
			if (Input.stirr_dia > 0) include_stirrups = true;

			if (include_steel_top || include_steel_bottom || include_stirrups) {
				this.output.push(
					opWr_text('Steel Class', Input.Material.class, 'Steel Quality', Input.Material.f_yk)
				);
			}
			if (include_steel_top) {
				this.output.push(opWr(4, outer_dia_top, 'Steel Diameter, Top', 'Ø_{top}', 'mm'));
				this.output.push(opWr(4, outer_spacing_top, 'Steel Spacing, Top', 's_{top}', 'mm'));
				this.output.push(opWr(4, cover_layer_top, 'Cover Layer, Top', 'c_{top}', 'mm'));
			}
			if (include_steel_bottom) {
				this.output.push(opWr(4, outer_dia_bot, 'Steel Diameter, Bottom', 'Ø_{top}', 'mm'));
				this.output.push(opWr(4, outer_spacing_bot, 'Steel Spacing, Bottom', 's_{bottom}', 'mm'));
				this.output.push(opWr(4, cover_layer_bot, 'Cover Layer, Bottom', 'c_{bottom}', 'mm'));
			}
			if (include_stirrups) {
				this.output.push(opWr(4, Input.stirr_dia, 'Stirrups Diameter', 'Ø_{stirrups}', 'mm'));
				this.output.push(opWr(4, Input.stirr_spacing, 'Stirrups Spacing', 's_{stirrups}', 'mm'));
			}

			// output section end:
		} else if (Input.Type === 'Circular' && Geometry.shape === 'Circular') {
			// Evenly distributed bars around a circular cross seciton:

			this.stirr_cov_top = Input.cover[0];
			this.stirr_cov_bot = Input.cover[0];

			if (Input.stirr_dia > 0) {
				Input.cover[0] += Input.stirr_dia;
			}

			var A_s: number[] = [];
			var d_s: number[] = [];
			var z_s: number[] = []; // reinf layer coordinates
			var y_s: number[] = [];
			var E_s: number[] = []; // reinf. elastic modulus [MPa]
			var dia: number[] = [];
			var spacing: number[] = [];
			var n_bar: number[] = []; // num of bars per layer

			let theta_0 = 0 || Input.theta_0;
			let radius = Geometry.radius;

			let Ssum = 0;
			let Asum = 0;

			for (let i = 0; i <= Input.nlayers - 1; i++) {
				// nlayers:     2
				// bar_dia:     [12, 12],
				// n_bar:       [12, 8],
				// cover:       [35, 40]
				radius = radius - Input.cover[i] - Input.bar_dia[i] / 2;
				let d_i = Geometry.radius + radius;
				let As_i = (Math.pow(Input.bar_dia[i], 2) * Math.PI) / 4;
				Asum += As_i;
				Ssum += d_i * As_i;

				for (let j = 0; j <= Input.n_bar[i] - 1; j++) {
					let theta = (theta_0 + j) * ((2 * Math.PI) / Input.n_bar[i]);

					dia.push(Input.bar_dia[i]);
					A_s.push(As_i);
					z_s.push(radius * Math.sin(theta));
					y_s.push(radius * Math.cos(theta));
					E_s.push(Input.Material.E_s);
					d_s.push(Geometry.radius - z_s[j]);
					spacing.push((2 * Math.PI * radius) / Input.n_bar[i]);
					n_bar.push(1);
				}
				radius = radius - dia[i] / 2;
			}

			var d_top = Ssum / Asum;
			var d_bot = d_top;

			var outer_dia_top = Input.bar_dia[0];
			var outer_dia_bot = outer_dia_top;
			var outer_spacing_top = spacing[0];
			var outer_spacing_bot = outer_spacing_top;

			var cover_layer_top = Input.cover[0];
			var cover_layer_bot = cover_layer_top;

			// output section start:
			this.output = [];

			let include_steel_circular = false;
			if (outer_dia_top > 0) include_steel_circular = true;
			let include_stirrups = false;
			if (Input.stirr_dia > 0) include_stirrups = true;

			if (include_steel_circular) {
				this.output.push(
					opWr_text('Steel Class', Input.Material.class, 'Steel Quality', Input.Material.f_yk)
				);
				this.output.push(opWr(4, outer_dia_top, 'Steel Diameter, Circular', 'Ø_{circular}', 'mm'));
				this.output.push(opWr(4, Input.n_bar, 'Number of Bars, Circular', 'n_{circular}', ''));
				this.output.push(opWr(4, cover_layer_top, 'Cover Layer, Circular', 'c_{circular}', 'mm'));
			}

			if (include_stirrups) {
				this.output.push(opWr(4, Input.stirr_dia, 'Stirrups Diameter', 'Ø_{stirrups}', 'mm'));
				this.output.push(opWr(4, Input.stirr_spacing, 'Stirrups Spacing', 's_{stirrups}', 'mm'));
			}

			// output section end:
		} else if (Input.Type === 'Rectangular_i') {
			// Regular beam type reinforcement, width number of bars rather than spacing

			this.stirr_cov_top = Input.cover_top[0];
			this.stirr_cov_bot = Input.cover_bot[0];

			// increase cover layer if stirrups:
			if (Input.stirr_dia > 0) {
				Input.cover_bot[0] += Input.stirr_dia;
				Input.cover_top[0] += Input.stirr_dia;
			}

			var A_s: number[] = [];
			var d_s: number[] = [];
			var z_s: number[] = []; // reinf layer coordinates
			var y_s: number[] = [];
			var E_s: number[] = []; // reinf. elastic modulus [MPa]
			var dia: number[] = [];
			var spacing: number[] = [];
			var n_bar: number[] = []; // num of bars per layer

			let width_bot = Geometry.width_bot;
			let width_top = Geometry.width_top;

			// Example:
			// Input.xx
			// .nlayers_top: 2
			// .nlayers_bot: 1
			// .n_bar_top:   [4, 2],
			// .n_bar_bot:   [4],
			// .bar_dia_top: [12, 12],
			// .bar_dia_bot: [12],
			// .cover_top:   [35, 40]
			// .cover_bot:   [35, 40]

			//	Top layers:
			let Ssum = 0;
			let Asum = 0;
			let cover = 0;
			let space = 0;
			for (let i = 0; i <= Input.nlayers_top - 1; i++) {
				// current cover from surface:
				cover = +Input.cover_top[i] + Input.bar_dia_top[i] / 2;
				if (i > 0) cover = +Input.bar_dia_top[i - 1] / 2;

				let As_i = (Math.pow(Input.bar_dia_top[i], 2) * Math.PI) / 4;
				let d_i = cover;
				Asum += As_i;
				Ssum += d_i * As_i;

				if (Input.n_bar_top[i] > 1) {
					var w_local = Math.max(0, width_top - 2 * Input.cover_top[0] - Input.bar_dia_top[i]);
					space = w_local / (Input.n_bar_top[i] - 1);
					if (space === 0) space = w_local / 2;
				} else {
					var w_local = 0;
					space = width_top / 2;
				}
				console.log(Input.n_bar_top[i]);

				for (let j = 0; j <= Input.n_bar_top[i] - 1; j++) {
					dia.push(Input.bar_dia_top[i]);
					A_s.push(As_i);
					z_s.push(Geometry.height - cover - Geometry.ref_z);
					y_s.push(-w_local / 2 + j * space);
					E_s.push(Input.Material.E_s);
					d_s.push(d_i);
					spacing.push(space);
					n_bar.push(1);
				}
			}
			var d_top = Ssum / Asum;
			var spacing_top = space;

			//	Bottom layers:
			Ssum = 0;
			Asum = 0;
			cover = 0;
			space = 0;
			for (let i = 0; i <= Input.nlayers_bot - 1; i++) {
				// current cover from surface:
				cover = +Input.cover_bot[i] + Input.bar_dia_bot[i] / 2;
				if (i > 0) cover = +Input.bar_dia_bot[i - 1] / 2;

				let As_i = (Math.pow(Input.bar_dia_bot[i], 2) * Math.PI) / 4;
				let d_i = Geometry.height - cover;

				Asum += As_i;
				Ssum += d_i * As_i;

				if (Input.n_bar_bot[i] > 1) {
					var w_local = Math.max(0, width_bot - 2 * Input.cover_bot[0] - Input.bar_dia_bot[i]);
					space = w_local / (Input.n_bar_bot[i] - 1);
					if (space === 0) space = w_local / 2;
				} else {
					var w_local = 0;
					space = width_bot / 2;
				}

				if (space === 0) console.error('bar spacing = 0');
				for (let j = 0; j <= Input.n_bar_bot[i] - 1; j++) {
					dia.push(Input.bar_dia_bot[i]);
					A_s.push(As_i);
					z_s.push(-Geometry.height + cover + Geometry.ref_z);
					y_s.push(-w_local / 2 + j * space);
					E_s.push(Input.Material.E_s);
					d_s.push(d_i);
					spacing.push(space);
					n_bar.push(1);
				}
			}
			var d_bot = Ssum / Asum;
			var spacing_bot = space;

			var outer_dia_top = Input.bar_dia_top[0];
			var outer_dia_bot = Input.bar_dia_bot[0];
			var outer_spacing_top = spacing_top;
			var outer_spacing_bot = spacing_bot;

			var cover_layer_top = Input.cover_top[0];
			let cover_layer_bot = Input.cover_bot[0];

			// output section start:
			this.output = [];

			let include_steel_top = false;
			let include_steel_bottom = false;
			let include_stirrups = false;
			if (outer_dia_top > 0) include_steel_top = true;
			if (outer_dia_bot > 0) include_steel_bottom = true;
			if (Input.stirr_dia > 0) include_stirrups = true;

			if (include_steel_top || include_steel_bottom) {
				this.output.push(
					opWr_text('Steel Class', Input.Material.class, 'Steel Quality', Input.Material.f_yk)
				);
			}
			if (include_steel_top) {
				this.output.push(opWr(4, outer_dia_top, 'Steel Diameter, Top', 'Ø_{top}', 'mm'));
				this.output.push(opWr(4, Input.n_bar_top, 'Number of Bars, Top', 'n_{top}', ''));
				this.output.push(opWr(4, cover_layer_top, 'Cover Layer, Top', 'c_{top}', 'mm'));
			}
			if (include_steel_bottom) {
				this.output.push(opWr(4, outer_dia_bot, 'Steel Diameter, Bottom', 'Ø_{top}', 'mm'));
				this.output.push(opWr(4, Input.n_bar_bot, 'Number of Bars, Bottom', 'n_{bottom}', ''));
				this.output.push(opWr(4, cover_layer_bot, 'Cover Layer, Bottom', 'c_{bottom}', 'mm'));
			}

			if (include_stirrups) {
				this.output.push(opWr(4, Input.stirr_dia, 'Stirrups Diameter', 'Ø_{stirrups}', 'mm'));
				this.output.push(opWr(4, Input.stirr_spacing, 'Stirrups Spacing', 's_{stirrups}', 'mm'));
			}

			// output section end:
		}

		// OUT:
		// General:
		this.Material = Input.Material;

		// Specific:
		this.A_s = A_s;
		this.d_s = d_s;
		this.z_s = z_s;
		this.y_s = y_s;
		this.E_s = E_s;
		this.dia = dia;
		this.n_bar = n_bar;

		// Shear reinf:
		this.dia_shear = Input.stirr_dia;
		this.spacing_shear = Input.stirr_spacing;
		this.A_sw = (Input.stirr_legs * Input.stirr_dia * Input.stirr_dia * Math.PI) / 4;
		this.shearMaterial = Input.Material; // option for different material

		// this.outer_bar = 11;
		this.outer_dia_top = outer_dia_top;
		this.outer_dia_bot = outer_dia_bot;
		this.d_top = d_top;
		this.d_bot = d_bot;
		this.outer_spacing_top = outer_spacing_top;
		this.outer_spacing_bot = outer_spacing_bot;
		this.cover_layer_top = cover_layer_top;
		this.cover_layer_bot = cover_layer_bot;
	}

	// Get_d(x) {
	//     // get effective lever arm 'd' from input x => bars within x/3 zone
	// 	let d = 0;

	// 	return d;
	// }
}
