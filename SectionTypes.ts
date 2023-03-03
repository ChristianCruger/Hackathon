// Library of different cross section shapes

// type structuralFibers = DURUS_EasyFinish | DURUS_S500

type slice = {
	A_c: number;
	z_c: number;
	y_c: number;
	// mat: object;
	// fibres: object;
	age: number;
	nodes: node[];
};

type node = {
	z: number;
	y: number;
};

type contour = {
	x: number[];
	y: number[];
};

export class Rectangular {
	// content:
	shape: 'Rectangular';
	IsUniform: boolean;
	Uniform_material: object;
	Uniform_fibres: object;
	ref_z: number;
	ref_y: number;
	height: number;
	width: number;
	width_top: number;
	width_bot: number;
	slices: slice[];
	Contour: contour[];
	bw: { z: number; y: number }; // shear width
	//
	constructor(
		height: number,
		width: number,
		material: object,
		fibres: object,
		div_z: number,
		div_y: number
	) {
		// Produces the needed geometry arrays for a rectangular cross section for input height and width
		this.shape = 'Rectangular';

		let dz = height / div_z;
		let dy = width / div_y;

		let ref_z = height / 2;
		let ref_y = width / 2;

		this.IsUniform = true; // switch to say whole section is uniform
		this.Uniform_material = material;
		this.Uniform_fibres = fibres;

		this.ref_z = ref_z;
		this.ref_y = ref_y;
		this.height = height;
		this.width = width;

		this.width_top = width;
		this.width_bot = width;

		let slices = []; // generate cross section discrtization
		for (let i = 0; i <= div_z - 1; i++) {
			for (let j = 0; j <= div_y - 1; j++) {
				let nodes: node[] = [];

				let z = height - dz * (i + 0.5) - ref_z;
				let y = width - dy * (j + 0.5) - ref_y;

				// corner nodes:
				nodes.push({ z: z - dz / 2, y: y - dy / 2 });
				nodes.push({ z: z + dz / 2, y: y - dy / 2 });
				nodes.push({ z: z + dz / 2, y: y + dy / 2 });
				nodes.push({ z: z - dz / 2, y: y + dy / 2 });

				let slice: slice = {
					A_c: dz * dy,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}
		this.slices = slices;

		this.Contour = [];
		this.Contour.push({
			x: [-ref_y, ref_y, ref_y, -ref_y, -ref_y],
			y: [-ref_z, -ref_z, ref_z, ref_z, -ref_z],
		});

		let bw = { z: width, y: height };
		this.bw = bw;
	}

	ShearArea = function (CG_of_comp: number, CG_of_tens: number, dir = 'Z') {
		let coords = [];
		let b = 0;
		if (dir === 'Z') {
			b = this.bw.z / 2;

			coords.push([-b, CG_of_comp]);
			coords.push([b, CG_of_comp]);
			coords.push([b, CG_of_tens]);
			coords.push([-b, CG_of_tens]);
		} else {
			b = this.bw.y / 2;

			coords.push([CG_of_comp, -b]);
			coords.push([CG_of_tens, -b]);
			coords.push([CG_of_tens, b]);
			coords.push([CG_of_comp, b]);
		}

		return coords;
	};

	Stirrups = function (
		dia: number,
		cover_top: number,
		cover_bot: number,
		cover_sides = Math.min(cover_bot, cover_top)
	) {
		let top = this.height / 2 - cover_top - dia / 2;
		let left = -(this.width / 2 - cover_sides - dia / 2);
		let right = this.width / 2 - cover_sides - dia / 2;
		let bot = -(this.height / 2 - cover_top - dia / 2);

		let lines = [];
		let bends = [];

		if (dia > 0) {
			let bend_rad = dia * 2;
			lines.push([left + bend_rad, top, right - bend_rad, top]);
			lines.push([left + bend_rad, bot, right - bend_rad, bot]);
			lines.push([left, bot + bend_rad, left, top - bend_rad]);
			lines.push([right, bot + bend_rad, right, top - bend_rad]);

			bends.push([
				left + bend_rad,
				top - bend_rad,
				bend_rad,
				-1 * Math.PI,
				(-1 / 2) * Math.PI,
				false,
			]);
			bends.push([right - bend_rad, top - bend_rad, bend_rad, (-1 / 2) * Math.PI, 0, false]);
			bends.push([right - bend_rad, bot + bend_rad, bend_rad, 0, (1 / 2) * Math.PI, false]);
			bends.push([
				left + bend_rad,
				bot + bend_rad,
				bend_rad,
				(1 / 2) * Math.PI,
				1 * Math.PI,
				false,
			]);
		}
		return {
			lines: lines,
			bends: bends,
		};
	};
}

export class Circular {
	// content:
	shape: 'Circular';
	IsUniform: boolean;
	Uniform_material: object;
	Uniform_fibres: object;
	ref_z: number;
	ref_y: number;
	height: number;
	width: number;
	radius: number;
	width_top: number;
	width_bot: number;
	slices: slice[];
	Contour: contour[];
	Area: number;
	bw: { z: number; y: number }; // shear width
	coverToReinf: number;

	constructor(
		Diameter: number,
		material: object,
		fibres: object,
		div_R: number = 20,
		div_theta: number = 24
	) {
		// Produces the needed geometry arrays for a rectangular cross section for input height and width
		this.shape = 'Circular';

		let ref_z = Diameter / 2;
		let ref_y = Diameter / 2;

		this.IsUniform = true; // switch to say whole section is uniform
		this.Uniform_material = material;
		this.Uniform_fibres = fibres;

		this.ref_z = ref_z;
		this.ref_y = ref_y;
		this.height = Diameter; // ??!
		this.width = Diameter; // !1

		this.radius = Diameter / 2;

		let slices: slice[] = []; // generate cross section discrtization
		let contour_x: number[] = [];
		let contour_y: number[] = [];
		let d_theta = (2 * Math.PI) / div_theta;

		this.coverToReinf = 0;
		let Iz = 0;

		let Area_i = (this.radius * this.radius * d_theta) / 2 / div_R; // target area of one slice

		let rad_0 = 0;
		let rad_1 = 0;

		for (let i = 0; i <= div_theta - 1; i++) {
			let theta = i * d_theta; // angular coordinate of slice
			rad_0 = 0;

			// for (let j = 0; j <= div_R - 1; j++) {
			// 	rad_1 = Math.sqrt(rad_0*rad_0*d_theta*d_theta + 2*Area_i * d_theta)/d_theta // mathcing by similar area of each slice

			// 	let d_rad = rad_1-rad_0;

			// 	let a1 = rad_0 * d_theta; // tangental thickness of slice at either end
			// 	let a2 = rad_1 * d_theta;

			// 	let Rad = rad_1 - (d_rad * (2 * a1 + a2)) / (3 * (a1 + a2)); // CG of trapezoid

			// 	let nodes : node[] = [];

			// 	// corner nodes:
			// 	nodes.push({
			// 		z: rad_0 * Math.sin(theta - 0.5 * d_theta),
			// 		y: rad_0 * Math.cos(theta - 0.5 * d_theta),
			// 	});
			// 	nodes.push({
			// 		z: rad_0 * Math.sin(theta + 0.5 * d_theta),
			// 		y: rad_0 * Math.cos(theta + 0.5 * d_theta),
			// 	});
			// 	nodes.push({
			// 		z: rad_1 * Math.sin(theta + 0.5 * d_theta),
			// 		y: rad_1 * Math.cos(theta + 0.5 * d_theta),
			// 	});
			// 	nodes.push({
			// 		z: rad_1 * Math.sin(theta - 0.5 * d_theta),
			// 		y: rad_1 * Math.cos(theta - 0.5 * d_theta),
			// 	});

			// 	let slice : slice = {
			// 		A_c: (d_rad * (a1 + a2)) / 2, // Area of trapezoid slice
			// 		z_c: Rad * Math.sin(theta), // CG:
			// 		y_c: Rad * Math.cos(theta),
			// 		mat: material,
			// 		fibres: fibres,
			// 		age: 0,
			// 		nodes: nodes
			// 	};
			// 	slices.push(slice);
			// 	rad_0 = rad_1
			// 	Iz += slice.A_c * slice.z_c * slice.z_c;
			// }

			// outer contour
			let Rad = this.radius;
			contour_x.push(Rad * Math.cos(theta));
			contour_y.push(Rad * Math.sin(theta));
		}
		contour_x.push(contour_x[0]);
		contour_y.push(contour_y[0]);

		// simply 1D mesh:
		for (let i = 0; i < 2 * div_R; i++) {
			let d = Diameter / (2 * div_R);
			let x = -this.radius + (i + 0.5) * d;
			let w = this.getWidth(x) / 2;

			for (let j = 0; j <= 1; j++) {
				let y = j * w - w / 2;

				// corner nodes:
				let nodes: node[] = [];

				nodes.push({
					z: x - d / 2,
					y: y - w / 2,
				});
				nodes.push({
					z: x + d / 2,
					y: y - w / 2,
				});
				nodes.push({
					z: x + d / 2,
					y: y + w / 2,
				});
				nodes.push({
					z: x - d / 2,
					y: y + w / 2,
				});

				let slice: slice = {
					A_c: d * w, // Area of trapezoid slice
					z_c: x,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);

				Iz += slice.A_c * slice.z_c * slice.z_c;
			}
		}

		this.Contour = [];
		this.Contour.push({
			x: contour_x,
			y: contour_y,
		});

		this.Area = Math.PI * Math.pow(this.radius, 2);
		let Iz_ratio = Iz / ((Math.PI / 4) * Math.pow(this.radius, 4));

		if (Math.abs(1 - Iz_ratio) > 0.0001) {
			console.warn('Note: Circle approximation not sufficient!');
			console.log('Cirlce approximation: ' + Math.abs(1 - Iz_ratio) * 100 + '%');
		} else {
			console.log('Cirlce approximation: ' + Math.abs(1 - Iz_ratio) * 100 + '%');
		}

		this.slices = slices;

		let bw = { z: 0.6 * Diameter, y: 0.6 * Diameter };
		this.bw = bw;
	}

	CalcBW = function (CG_of_comp: number, CG_of_tens: number, coverToReinf = this.coverToReinf) {
		let w_comp = this.getWidth(CG_of_comp, this.radius);
		let w_tens = this.getWidth(CG_of_tens, this.radius - coverToReinf);

		let width = Math.min(w_comp, w_tens);

		let bw = { z: width, y: width };
		// side effect - set this.bw values (shitty implementation!!)
		this.bw = bw;
		this.coverToReinf = coverToReinf;

		return bw;
	};

	getWidth = function (distanceFromMiddle: number, R = this.radius) {
		let x = Math.abs(distanceFromMiddle);

		if (x > R) {
			console.warn('Cannot get width outside of section');
			return NaN;
		}

		return 2 * Math.sqrt(R * R - x * x);
	};

	ShearArea = function (CG_of_comp: number, CG_of_tens: number, dir = 'Z') {
		let coords = [];
		let b = 0;

		let BW = this.CalcBW(CG_of_comp, CG_of_tens);
		if (dir === 'Z') {
			b = BW.z / 2;

			coords.push([-b, CG_of_comp]);
			coords.push([b, CG_of_comp]);
			coords.push([b, CG_of_tens]);
			coords.push([-b, CG_of_tens]);
		} else {
			b = BW.y / 2;

			coords.push([CG_of_comp, -b]);
			coords.push([CG_of_tens, -b]);
			coords.push([CG_of_tens, b]);
			coords.push([CG_of_comp, b]);
		}

		return coords;
	};

	Stirrups = function (
		dia: number,
		cover: number,
		cover_bot = cover,
		cover_sides = Math.min(cover_bot, cover)
	) {
		let lines = [];
		let bends = [];

		if (dia > 0) {
			let bend_rad = this.radius - cover - dia / 2;
			bends.push([0, 0, bend_rad, 0, 2 * Math.PI, false]);
		}
		return {
			lines: lines,
			bends: bends,
		};
	};
}

export class Hollow_Rectangular {
	shape: 'Hollow_Rectangular';
	IsUniform: boolean;
	Uniform_material: object;
	Uniform_fibres: object;
	ref_z: number;
	ref_y: number;
	height: number;
	width: number;
	radius: number;
	width_top: number;
	width_bot: number;
	slices: slice[];
	Contour: contour[];
	thickness: number; // needed??
	bw: { z: number; y: number }; // shear width

	constructor(
		height: number,
		width: number,
		thickness: number,
		material: object,
		fibres: object,
		div_z: number,
		div_y: number,
		div_t: number
	) {
		// Produces the needed geometry arrays for a rectangular cross section for input height and width
		this.shape = 'Hollow_Rectangular';

		let dz = (height - 2 * thickness) / div_z;
		let dy = width / div_y;
		let dt = thickness / div_t;

		let ref_z = height / 2;
		let ref_y = width / 2;

		this.IsUniform = true; // switch to say whole section is uniform
		this.Uniform_material = material;
		this.Uniform_fibres = fibres;

		this.ref_z = ref_z;
		this.ref_y = ref_y;
		this.height = height;
		this.width = width;
		this.thickness = thickness; // needed as a .this ??

		this.width_top = width;
		this.width_bot = width;

		let slices: slice[] = []; // generate cross section discrtization

		let bw = { z: 2 * thickness, y: 2 * thickness };
		this.bw = bw;

		//bottom flange:
		for (let i = 0; i <= div_y - 1; i++) {
			//along width
			for (let j = 0; j <= div_t - 1; j++) {
				// across thickness

				let z = dt * (j + 0.5) - ref_z;
				let y = dy * (i + 0.5) - ref_y;
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dt / 2, y: y - dy / 2 });
				nodes.push({ z: z + dt / 2, y: y - dy / 2 });
				nodes.push({ z: z + dz / 2, y: y + dy / 2 });
				nodes.push({ z: z - dt / 2, y: y + dy / 2 });

				let slice: slice = {
					A_c: dt * dy,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		//top flange:
		for (let i = 0; i <= div_y - 1; i++) {
			//along width
			for (let j = 0; j <= div_t - 1; j++) {
				// across thickness

				let z = ref_z - dt * (j + 0.5);
				let y = dy * (i + 0.5) - ref_y;
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dt / 2, y: y - dy / 2 });
				nodes.push({ z: z + dt / 2, y: y - dy / 2 });
				nodes.push({ z: z + dz / 2, y: y + dy / 2 });
				nodes.push({ z: z - dt / 2, y: y + dy / 2 });

				let slice: slice = {
					A_c: dt * dy,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		//left web:
		for (let i = 0; i <= div_z - 1; i++) {
			//along height

			for (let j = 0; j <= div_t - 1; j++) {
				// across thickness

				let z = dz * (i + 0.5) - ref_z + thickness;
				let y = dt * (j + 0.5) - ref_y;
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dz / 2, y: y - dt / 2 });
				nodes.push({ z: z + dz / 2, y: y - dt / 2 });
				nodes.push({ z: z + dz / 2, y: y + dt / 2 });
				nodes.push({ z: z - dz / 2, y: y + dt / 2 });

				let slice: slice = {
					A_c: dt * dz,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		//right web:
		for (let i = 0; i <= div_z - 1; i++) {
			//along height

			for (let j = 0; j <= div_t - 1; j++) {
				// across thickness

				let z = dz * (i + 0.5) - ref_z + thickness;
				let y = ref_y - dt * (j + 0.5);
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dz / 2, y: y - dt / 2 });
				nodes.push({ z: z + dz / 2, y: y - dt / 2 });
				nodes.push({ z: z + dz / 2, y: y + dt / 2 });
				nodes.push({ z: z - dz / 2, y: y + dt / 2 });

				let slice: slice = {
					A_c: dt * dz,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		this.slices = slices;

		this.Contour = [];
		// outer perimeter:
		this.Contour.push({
			x: [-ref_y, ref_y, ref_y, -ref_y, -ref_y],
			y: [-ref_z, -ref_z, ref_z, ref_z, -ref_z],
		});

		// inner perimeter:
		this.Contour.push({
			x: [
				-(ref_y - thickness),
				ref_y - thickness,
				ref_y - thickness,
				-(ref_y - thickness),
				-(ref_y - thickness),
			],
			y: [
				-(ref_z - thickness),
				-(ref_z - thickness),
				ref_z - thickness,
				ref_z - thickness,
				-(ref_z - thickness),
			],
		});
	}
}

export class Trapezoid {
	// content:
	shape: 'Trapezoid';
	IsUniform: boolean;
	Uniform_material: object;
	Uniform_fibres: object;
	ref_z: number;
	ref_y: number;
	height: number;
	width: number;
	width_top: number;
	width_bot: number;
	slices: slice[];
	Contour: contour[];
	bw: { z: number; y: number }; // shear width

	constructor(
		height: number,
		width_top: number,
		width_bot: number,
		material: object,
		fibres: object,
		div_z: number,
		div_y: number
	) {
		// Produces the needed geometry arrays for a rectangular cross section for input height and width
		this.shape = 'Trapezoid';

		let dz = height / div_z;
		// let dy = (width_top+width_bot) / (2*div_y);

		let ref_z = height / 2;
		let ref_y = (width_top + width_bot) / 4;

		this.IsUniform = true; // switch to say whole section is uniform
		this.Uniform_material = material;
		this.Uniform_fibres = fibres;

		this.ref_z = ref_z;
		this.ref_y = ref_y;
		this.height = height;

		this.width_top = width_top;
		this.width_bot = width_bot;

		this.width = (width_top + width_bot) / 2;

		this.bw = { z: Math.min(width_top, width_bot), y: height };

		let slices: slice[] = []; // generate cross section discrtization
		for (let i = 0; i <= div_z - 1; i++) {
			let z_bot = dz * i;
			let z_top = dz * (i + 1);
			let z_mid = (z_bot + z_top) / 2; // mid point of slice
			let Area_i = (this.getWidth(z_mid) * dz) / div_y;

			let a = this.getWidth(z_top);
			let b = this.getWidth(z_top);
			let z_cg = z_bot + (dz / 3) * ((2 * a + b) / (a + b));

			let width_i = this.getWidth(z_cg);
			let dy = width_i / div_y;

			for (let j = 0; j <= div_y - 1; j++) {
				let dy_top = a / div_y;
				let dy_bot = b / div_y;

				let nodes: node[] = [];
				nodes.push({ z: z_bot, y: dy_bot * j - b / 2 });
				nodes.push({ z: z_top, y: dy_top * j - a / 2 });
				nodes.push({ z: z_top, y: dy_top * (j + 1) - a / 2 });
				nodes.push({ z: z_bot, y: dy_bot * (j + 1) - b / 2 });

				let z = z_cg - ref_z;
				let y = dy * (j + 0.5) - width_i / 2;

				let slice: slice = {
					A_c: Area_i, //dz * dy,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}
		this.slices = slices;

		this.Contour = [];
		this.Contour.push({
			x: [-(width_bot / 2), width_bot / 2, width_top / 2, -(width_top / 2), -(width_bot / 2)],
			y: [-ref_z, -ref_z, ref_z, ref_z, -ref_z],
		});
	}

	getWidth(distanceFromBottom: number) {
		return this.width_bot + (distanceFromBottom / this.height) * (this.width_top - this.width_bot);
	}

	ShearArea = function (CG_of_comp: number, CG_of_tens: number, dir = 'Z') {
		let coords = [];
		let b = 0;
		if (dir === 'Z') {
			b = this.bw.z / 2;

			coords.push([-b, CG_of_comp]);
			coords.push([b, CG_of_comp]);
			coords.push([b, CG_of_tens]);
			coords.push([-b, CG_of_tens]);
		} else {
			b = this.bw.y / 2;

			coords.push([CG_of_comp, -b]);
			coords.push([CG_of_tens, -b]);
			coords.push([CG_of_tens, b]);
			coords.push([CG_of_comp, b]);
		}

		return coords;
	};
}

export class T_section {
	// content:
	shape: 'T-section';
	IsUniform: boolean;
	Uniform_material: object;
	Uniform_fibres: object;
	ref_z: number;
	ref_y: number;
	height: number;
	width: number;
	width_top: number;
	width_bot: number;
	slices: slice[];
	Contour: contour[];
	bw: { z: number; y: number }; // shear width
	t_flange: number; // flange thickness

	constructor(
		height: number,
		width_top: number,
		thickness_web: number,
		thickness_flange: number,
		material: object,
		fibres: object,
		div: number,
		div_t: number
	) {
		// Produces the needed geometry arrays for a rectangular cross section for input height and width
		this.shape = 'T-section';

		let dtw = thickness_web / div_t;

		let dz = (height - thickness_flange) / div;

		let div_flage = div_t; // Math.round(div_t * width_top/thickness_web)
		let div_z_fl = Math.round((div * thickness_flange) / (height - thickness_flange));

		let dtf = thickness_flange / div_z_fl;
		let dy = width_top / div_flage;

		let offset_web_y = 0;

		let ref_z = height / 2; // !!!!
		let ref_y = width_top / 2;

		this.IsUniform = true; // switch to say whole section is uniform
		this.Uniform_material = material;
		this.Uniform_fibres = fibres;

		this.ref_z = ref_z;
		this.ref_y = ref_y;
		this.height = height;
		this.width = width_top;

		this.width_top = width_top;
		this.width_bot = thickness_web;
		this.t_flange = thickness_flange;
		this.bw = { z: Math.min(width_top, thickness_web), y: height };

		let slices: slice[] = []; // generate cross section discrtization
		//top flange:
		for (let i = 0; i <= div_flage - 1; i++) {
			//along width
			for (let j = 0; j <= div_z_fl - 1; j++) {
				// across thickness

				let z = ref_z - dtf * (j + 0.5);
				let y = dy * (i + 0.5) - ref_y;
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dtf / 2, y: y - dy / 2 });
				nodes.push({ z: z + dtf / 2, y: y - dy / 2 });
				nodes.push({ z: z + dtf / 2, y: y + dy / 2 });
				nodes.push({ z: z - dtf / 2, y: y + dy / 2 });

				let slice: slice = {
					A_c: dtf * dy,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		// web
		for (let i = 0; i <= div - 1; i++) {
			//along height
			for (let j = 0; j <= div_t - 1; j++) {
				// across thickness

				let z = dz * (i + 0.5) - ref_z;
				let y = dtw * (j + 0.5) - thickness_web / 2 + offset_web_y;
				// corner nodes:
				let nodes: node[] = [];
				nodes.push({ z: z - dz / 2, y: y - dtw / 2 });
				nodes.push({ z: z + dz / 2, y: y - dtw / 2 });
				nodes.push({ z: z + dz / 2, y: y + dtw / 2 });
				nodes.push({ z: z - dz / 2, y: y + dtw / 2 });

				let slice: slice = {
					A_c: dtw * dz,
					z_c: z,
					y_c: y,
					// mat: material,
					// fibres: fibres,
					age: 0,
					nodes: nodes,
				};
				slices.push(slice);
			}
		}

		this.slices = slices;

		this.Contour = [];
		this.Contour.push({
			x: [
				-(width_top / 2),
				width_top / 2,
				width_top / 2,
				thickness_web / 2 + offset_web_y,
				thickness_web / 2 + offset_web_y,
				-(thickness_web / 2) + offset_web_y,
				-(thickness_web / 2) + offset_web_y,
				-(width_top / 2),
				-(width_top / 2),
			],
			y: [
				height / 2,
				height / 2,
				height / 2 - thickness_flange,
				height / 2 - thickness_flange,
				-(height / 2),
				-(height / 2),
				height / 2 - thickness_flange,
				height / 2 - thickness_flange,
				height / 2,
			],
		});
	}

	ShearArea = function (CG_of_comp: number, CG_of_tens: number, dir = 'Z') {
		let coords = [];
		let b = 0;
		if (dir === 'Z') {
			b = this.bw.z / 2;

			coords.push([-b, CG_of_comp]);
			coords.push([b, CG_of_comp]);
			coords.push([b, CG_of_tens]);
			coords.push([-b, CG_of_tens]);
		} else {
			b = this.bw.y / 2;

			coords.push([CG_of_comp, -b]);
			coords.push([CG_of_tens, -b]);
			coords.push([CG_of_tens, b]);
			coords.push([CG_of_comp, b]);
		}

		return coords;
	};

	Stirrups = function (
		dia: number,
		cover_top: number,
		cover_bot: number,
		cover_sides = Math.min(cover_bot, cover_top)
	) {
		// (width_top/2), (width_top/2), (thickness_web/2+offset_web_y),
		// (thickness_web/2+offset_web_y), -(thickness_web/2)+offset_web_y, -(thickness_web/2)+offset_web_y, -(width_top/2),-(width_top/2)],
		// y: [(height/2), (height/2), (height/2-thickness_flange)

		// this.width_top = width_top;
		// this.width_bot = thickness_web;
		// this.t_flange = thickness_flange

		let top = this.height / 2 - cover_top - dia / 2;
		let left = -(this.width_top / 2 - cover_sides - dia / 2);
		let right = this.width_top / 2 - cover_sides - dia / 2;

		let bot_flage = this.height / 2 - this.t_flange + cover_top + dia / 2;

		let left_web = -(this.width_bot / 2 - cover_sides - dia / 2);
		let right_web = this.width_bot / 2 - cover_sides - dia / 2;

		let bot = -(this.height / 2 - cover_top - dia / 2);

		let lines = [];
		let bends = [];

		if (dia > 0) {
			let bend_rad = dia * 2;

			// flange
			lines.push([left + bend_rad, top, right - bend_rad, top]);
			lines.push([left + bend_rad, bot_flage, right - bend_rad, bot_flage]);
			lines.push([left, bot_flage + bend_rad, left, top - bend_rad]);
			lines.push([right, bot_flage + bend_rad, right, top - bend_rad]);

			bends.push([
				left + bend_rad,
				top - bend_rad,
				bend_rad,
				-1 * Math.PI,
				(-1 / 2) * Math.PI,
				false,
			]);
			bends.push([right - bend_rad, top - bend_rad, bend_rad, (-1 / 2) * Math.PI, 0, false]);
			bends.push([right - bend_rad, bot_flage + bend_rad, bend_rad, 0, (1 / 2) * Math.PI, false]);
			bends.push([
				left + bend_rad,
				bot_flage + bend_rad,
				bend_rad,
				(1 / 2) * Math.PI,
				1 * Math.PI,
				false,
			]);

			//web
			lines.push([left_web + bend_rad, bot, right_web - bend_rad, bot]);
			lines.push([left_web, bot + bend_rad, left_web, top - bend_rad]);
			lines.push([right_web, bot + bend_rad, right_web, top - bend_rad]);

			bends.push([
				left_web + bend_rad,
				top - bend_rad,
				bend_rad,
				-1 * Math.PI,
				(-1 / 2) * Math.PI,
				false,
			]);
			bends.push([right_web - bend_rad, top - bend_rad, bend_rad, (-1 / 2) * Math.PI, 0, false]);
			bends.push([right_web - bend_rad, bot + bend_rad, bend_rad, 0, (1 / 2) * Math.PI, false]);
			bends.push([
				left_web + bend_rad,
				bot + bend_rad,
				bend_rad,
				(1 / 2) * Math.PI,
				1 * Math.PI,
				false,
			]);
		}
		return {
			lines: lines,
			bends: bends,
		};
	};
}
