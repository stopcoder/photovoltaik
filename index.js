import fs from 'fs';
import readline from 'readline';

const filename = "data2";

const consumption = {
	wp: {
		day: [2, 2],
		night: [3, 10]
	},
	rest: {
		day: [3, 5],
		night: [5, 7]
	}
};

const seasonMap = [1,1,1,1,0,0,0,0,0,0,1,1];
const price = [0.3077, 0.2428];
const sellPrice = 0.07924;
const maintainCost = 250;

const batteryLoss = 0.1;


async function processLineByLine() {
	const fileStream = fs.createReadStream(filename);

	const rl = readline.createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	const produceRate = [[]];
	let index = 0;

	for await (const line of rl) {
		if (!line) {
			index++;
			produceRate[index] = [];
		} else {
			const parts = line.split("\t");
			produceRate[index].push(parseFloat(parts[2].replace(/\./g, "").replace(/,/, ".")));
		}
	}

	function simulate(systemSize, batterySize) {
		console.log(`${systemSize} kwp, battery ${batterySize} kwh`);
		let wpTotal = 0;
		let restTotal = 0;
		let produceTotal = 0;
		let sellTotal = 0;
		let buyTotal = 0;
		let directlyUsedTotal = 0;
		let batteryTotal = 0;
		let buyWp = 0;

		let currentBattery = 0;

		produceRate.forEach((monthData, month) => {
			monthData.forEach((rate, day) => {
				const seasonIndex = seasonMap[month];
				const produced = rate * systemSize;

				produceTotal += produced;

				const dayConsumption = consumption.wp.day[seasonIndex] + consumption.rest.day[seasonIndex];
				const nightConsumption = consumption.wp.night[seasonIndex] + consumption.rest.night[seasonIndex];

				// day
				let rest = produced - dayConsumption;

				if (rest >= 0) {
					directlyUsedTotal += dayConsumption;
					const batteryNeeded = batterySize - currentBattery;

					if (rest >= batteryNeeded) {
						batteryTotal += batteryNeeded;
						currentBattery = batterySize;
						rest -= batteryNeeded;
					} else {
						batteryTotal += rest;
						currentBattery += rest;
						rest = 0;
					}
				} else {
					if (currentBattery >= ((-rest) / (1 - batteryLoss))) {
						currentBattery += rest / (1 - batteryLoss);
						rest = 0;
					} else {
						rest += (currentBattery * (1 - batteryLoss));
						currentBattery = 0;
					}

					directlyUsedTotal += produced;
					buyTotal += (-rest);
					buyWp += ((-rest) * consumption.wp.day[seasonIndex] / (consumption.wp.day[seasonIndex] + consumption.rest.day[seasonIndex]));
					rest = 0;
				}

				sellTotal += rest;

				// night
				if (currentBattery >= (nightConsumption / (1 - batteryLoss))) {
					currentBattery -= (nightConsumption/ (1 - batteryLoss));
				} else {
					buyTotal += (nightConsumption - currentBattery * (1 - batteryLoss));
					buyWp += ((nightConsumption - currentBattery * (1- batteryLoss)) * consumption.wp.day[seasonIndex] / (consumption.wp.day[seasonIndex] + consumption.rest.day[seasonIndex]));
					currentBattery = 0;
				}

				wpTotal += (consumption.wp.day[seasonIndex] + consumption.wp.night[seasonIndex]);
				restTotal += (consumption.rest.day[seasonIndex] + consumption.rest.night[seasonIndex]);
			});
		});

		const costWithout = wpTotal * price[1] + restTotal * price[0];
		let cost = buyTotal * price[0];
		const sellWin =  sellPrice * sellTotal;
		const save = costWithout - cost + sellWin - maintainCost;


		return {
			solar: {
				produced: produceTotal,
				used: {
					direct: directlyUsedTotal,
					battery: batteryTotal,
					sold: sellTotal
				}
			},
			consumption: {
				wp: wpTotal,
				rest: restTotal,
				bought: {
					total: buyTotal,
					wp: buyWp
				}
			},
			cost: {
				withoutSolar: costWithout,
				current: cost,
				sold: sellWin,
				saved: save
			},
			autarkie: (directlyUsedTotal + batteryTotal) / (wpTotal + restTotal)
		};
	}

	const base = 8200;
	const unitPrice = 500;

	const batteryPrice = [[0, 0, 0], [6, 3600, 800], [9, 4800, 800], [12, 6000, 800]];
	const panelDiscount = 1000;
	const batteryDiscount = 600;

	let min = 20;
	let finalSize;
	let baseSaves = new Map();
	const returnTimes = [];
	for (let systemSize = 14; systemSize <= 14; systemSize++) {
		batteryPrice.forEach(([size, price, delta]) => {
			const costBase = base + unitPrice * systemSize - panelDiscount - (size ? batteryDiscount : 0);
			const result = simulate(systemSize, size);
			console.log(result);
			const returnTime = (costBase + price + delta) / result.cost.saved;
			returnTimes.push(returnTime);
			if (returnTime < min) {
				min = returnTime;
				finalSize = [systemSize, size];
			}
			if (size === 0) {
				baseSaves.set(systemSize, result.cost.saved);
			} else {
				const extraSave = result.cost.saved - baseSaves.get(systemSize);
				console.log("battery return time: ", (price + delta - (size ? batteryDiscount : 0)) / extraSave);
			}
			console.log(`saved: ${result.cost.saved}`);
			console.log(`total return time: ${returnTime}`);
			console.log(`wp used: ${result.consumption.bought.wp}`);
			console.log();
		});
	}

	console.log("best combination: ", finalSize);
	console.log("return times: ", returnTimes);
}

processLineByLine();
