import { analyse } from './Hack_slab';

(<any>window).run = () => {
	//  varialble inputs:
	const fck = 40; // min 16 max 50 - interal 5
	const thick = 100; // min 100 max 400 - Iinterval 10

	//reinforcement:
	const fiber = '3'; // valid: '0','2','3','4','5','6','8','10'
	const dia_top = 0; //   min 0 max 32
	const dia_bot = 0; //   min 0 max 32

	//insulation
	const insulation = 'S80'; // options 'C60','C80','S60',S80','S100','S150'
	const ins_thick = 400; // min 0 max 500

	let RES = analyse(fck, thick, fiber, dia_top, dia_bot, insulation, ins_thick);
	console.log('results', RES);
};
