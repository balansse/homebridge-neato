const CustomUUID = {
	SpotCleanWidth: 'A7889A9A-2F27-4293-BEF8-3FE805B36F4E',
	SpotCleanHeight: 'CA282DB2-62BF-4325-A1BE-F8BB5478781A',
	SpotCleanRepeat: '1E79C603-63B8-4E6A-9CE1-D31D67981831'
};

let Service,
	Characteristic,
	SpotWidthCharacteristic,
	SpotHeightCharacteristic,
	SpotRepeatCharacteristic;

module.exports = function (_Service, _Characteristic)
{
	Service = _Service;
	Characteristic = _Characteristic;
	SpotWidthCharacteristic = require('../characteristics/spotWidth')(Characteristic, CustomUUID);
	SpotHeightCharacteristic = require('../characteristics/spotHeight')(Characteristic, CustomUUID);
	SpotRepeatCharacteristic = require('../characteristics/spotRepeat')(Characteristic, CustomUUID);

	return NeatoVacuumRobotAccessory;
};

class NeatoVacuumRobotAccessory {
	constructor(platform, robotObject)
	{
		this.platform = platform;
		this.log = platform.log;
		this.api = platform.api;
		
		this.refresh = platform.refresh;
		this.hiddenServices = platform.hiddenServices;
		this.nextRoom = platform.nextRoom;

		this.robotObject = robotObject;
		this.robot = robotObject.device;
		this.meta = robotObject.meta;
		this.spotPlusFeatures = ((typeof robotObject.availableServices.spotCleaning !== 'undefined') && robotObject.availableServices.spotCleaning.includes("basic"));
		this.boundary = (typeof robotObject.boundary === 'undefined') ? null : robotObject.boundary;

		let name;
		if (this.boundary == null)
		{
			name = this.robot.name;
		}
		else
		{
			// if boundary name already exists
			if (platform.boundaryNames.includes(this.boundary.name))
			{
				let lastChar = this.boundary.name.slice(-1);
				// boundary name already contains a count number
				if (!isNaN(lastChar))
				{
					// Increment existing count number
					this.boundary.name = this.boundary.name.slice(0, -1) + (parseInt(lastChar) + 1);
				}
				else
				{
					// Add a new count number
					this.boundary.name = this.boundary.name + " 2";
				}
			}
			platform.boundaryNames.push(this.boundary.name);
			name = this.robot.name + ' - ' + this.boundary.name;
		}

		this.accessory = new api.PlatformAccessory(
			name,
			api.hap.uuid.generate("Neato:" + name + ":" + this.robot._serial)
			)

		this.batteryService = new Service.BatteryService("Battery", "battery");

		if (this.boundary == null)
		{
			this.cleanService = new Service.Switch(this.name + " Clean", "clean");
			this.goToDockService = new Service.Switch(this.name + " Go to Dock", "goToDock");
			this.dockStateService = new Service.OccupancySensor(this.name + " Dock", "dockState");
			this.ecoService = new Service.Switch(this.name + " Eco Mode", "eco");
			this.noGoLinesService = new Service.Switch(this.name + " NoGo Lines", "noGoLines");
			this.extraCareService = new Service.Switch(this.name + " Extra Care", "extraCare");
			this.scheduleService = new Service.Switch(this.name + " Schedule", "schedule");
			this.findMeService = new Service.Switch(this.name + " Find Me", "findMe");

			this.spotCleanService = new Service.Switch(this.name + " Clean Spot", "cleanSpot");
			this.spotCleanService.addCharacteristic(SpotRepeatCharacteristic);
			if (this.spotPlusFeatures)
			{
				this.spotCleanService.addCharacteristic(SpotWidthCharacteristic);
				this.spotCleanService.addCharacteristic(SpotHeightCharacteristic);
			}
		}
		else
		{
			const splitName = this.boundary.name.split(' ');
			let serviceName = "Clean the " + this.boundary.name;
			if (splitName.length >= 2 && splitName[splitName.length - 2].match(/[']s$/g))
			{
				serviceName = "Clean " + this.boundary.name;
			}
			this.cleanService = new Service.Switch(serviceName, "cleanBoundary:" + this.boundary.id);
		}

		this.log("Added cleaning device named: " + this.name);
	}

	identify(callback)
	{
		// try {
		// 	await this.robot.getState();
		// }
		// catch (error) {
		// 	this.log.error("Error getting robot information: " + error + ": " + result);
		// }

		this.log.debug(`Identify request for ${this.name}`);
		// this.log(result);

		callback();

	}

	getServices()
	{
		this.informationService = new Service.AccessoryInformation();
		this.informationService
		.setCharacteristic(Characteristic.Manufacturer, "Neato Robotics")
		.setCharacteristic(Characteristic.Model, this.meta.modelName)
		.setCharacteristic(Characteristic.SerialNumber, this.robot._serial)
		.setCharacteristic(Characteristic.FirmwareRevision, this.meta.firmware)
		.setCharacteristic(Characteristic.Name, this.robot.name + (this.boundary == null ? '' : ' - ' + this.boundary.name));

		this.cleanService.getCharacteristic(Characteristic.On).on('set', this.setClean.bind(this));
		this.cleanService.getCharacteristic(Characteristic.On).on('get', this.getClean.bind(this));

		this.services = [this.informationService, this.cleanService];

		if (this.boundary == null)
		{
			this.batteryService.getCharacteristic(Characteristic.BatteryLevel).on('get', this.getBatteryLevel.bind(this));
			this.batteryService.getCharacteristic(Characteristic.ChargingState).on('get', this.getBatteryChargingState.bind(this));
			this.services.push(this.batteryService);

			this.goToDockService.getCharacteristic(Characteristic.On).on('set', this.setGoToDock.bind(this));
			this.goToDockService.getCharacteristic(Characteristic.On).on('get', this.getGoToDock.bind(this));

			this.dockStateService.getCharacteristic(Characteristic.OccupancyDetected).on('get', this.getDock.bind(this));

			this.ecoService.getCharacteristic(Characteristic.On).on('set', this.setEco.bind(this));
			this.ecoService.getCharacteristic(Characteristic.On).on('get', this.getEco.bind(this));

			this.noGoLinesService.getCharacteristic(Characteristic.On).on('set', this.setNoGoLines.bind(this));
			this.noGoLinesService.getCharacteristic(Characteristic.On).on('get', this.getNoGoLines.bind(this));

			this.extraCareService.getCharacteristic(Characteristic.On).on('set', this.setExtraCare.bind(this));
			this.extraCareService.getCharacteristic(Characteristic.On).on('get', this.getExtraCare.bind(this));

			this.scheduleService.getCharacteristic(Characteristic.On).on('set', this.setSchedule.bind(this));
			this.scheduleService.getCharacteristic(Characteristic.On).on('get', this.getSchedule.bind(this));

			this.findMeService.getCharacteristic(Characteristic.On).on('set', this.setFindMe.bind(this));
			this.findMeService.getCharacteristic(Characteristic.On).on('get', this.getFindMe.bind(this));

			this.spotCleanService.getCharacteristic(Characteristic.On).on('set', this.setSpotClean.bind(this));
			this.spotCleanService.getCharacteristic(Characteristic.On).on('get', this.getSpotClean.bind(this));
			this.spotCleanService.getCharacteristic(SpotRepeatCharacteristic).on('set', this.setSpotRepeat.bind(this));
			this.spotCleanService.getCharacteristic(SpotRepeatCharacteristic).on('get', this.getSpotRepeat.bind(this));

			if (this.spotPlusFeatures)
			{
				this.spotCleanService.getCharacteristic(SpotWidthCharacteristic).on('set', this.setSpotWidth.bind(this));
				this.spotCleanService.getCharacteristic(SpotWidthCharacteristic).on('get', this.getSpotWidth.bind(this));
				this.spotCleanService.getCharacteristic(SpotHeightCharacteristic).on('set', this.setSpotHeight.bind(this));
				this.spotCleanService.getCharacteristic(SpotHeightCharacteristic).on('get', this.getSpotHeight.bind(this));
			}

			if (this.hiddenServices.indexOf('spot') === -1)
			{
				this.services.push(this.spotCleanService);
			}

			// Add optional services
			if (this.hiddenServices.indexOf('dock') === -1)
				this.services.push(this.goToDockService);
			if (this.hiddenServices.indexOf('dockstate') === -1)
				this.services.push(this.dockStateService);
			if (this.hiddenServices.indexOf('eco') === -1)
				this.services.push(this.ecoService);
			if (this.hiddenServices.indexOf('nogolines') === -1)
				this.services.push(this.noGoLinesService);
			if (this.hiddenServices.indexOf('extracare') === -1)
				this.services.push(this.extraCareService);
			if (this.hiddenServices.indexOf('schedule') === -1)
				this.services.push(this.scheduleService);
			if (this.hiddenServices.indexOf('find') === -1)
				this.services.push(this.findMeService);
		}

		return this.services;
	}

	async getClean(callback)
	{
		await this.platform.updateRobot(this.robot._serial)

		let cleaning;
		if (this.boundary == null)
		{
			cleaning = this.robot.canPause;
		}
		else
		{
			cleaning = this.robot.canPause && (this.robot.cleaningBoundaryId === this.boundary.id)
		}

		this.log.debug(this.name + ": Cleaning is " + (cleaning ? 'ON' : 'OFF'));
		callback(false, cleaning);
	}

	async setClean(on, callback)
	{
		this.log.debug(this.name + ": " + (on ? "Enabled " : "Disabled") + " Clean " + (this.boundary ? JSON.stringify(this.boundary) : ''));
		await this.platform.updateRobot(this.robot._serial)
			// Start
			if (on)
			{
				// No room given or same room
				if (this.boundary == null || this.robot.cleaningBoundaryId === this.boundary.id)
				{
					// Resume cleaning
					if (this.robot.canResume)
					{
						this.log.debug(this.name + ": ## Resume cleaning");
						this.robot.resumeCleaning(callback);
					}
					// Start cleaning
					else if (this.robot.canStart)
					{
						this.log.debug(this.name + ": ## Start cleaning");
						this.clean(callback);
					}
					// Cannot start
					else
					{
						this.log.debug(this.name + ": Cannot start, maybe already cleaning (expected)");
						callback();
					}
				}
				// Different room given
				else
				{
					// Return to dock
					if (this.robot.canPause || this.robot.canResume)
					{
						this.log.debug(this.name + ": ## Returning to dock to start cleaning of new room");
						this.setGoToDock(true, (error, result) =>
						{
							this.nextRoom = this.boundary.id;
							callback();
						});
					}
					// Start new cleaning of new room
					else
					{
						this.log.debug(this.name + ": ## Start cleaning of new room");
						this.clean(callback);
					}
				}
			}
			// Stop
			else
			{
				if (this.robot.canPause)
				{
					this.log.debug(this.name + ": ## Pause cleaning");
					this.robot.pauseCleaning(callback);
				}
				else
				{
					this.log.debug(this.name + ": Already paused");
					callback();
				}
			}
	}

	clean(callback, spot)
	{
		// Start automatic update while cleaning
		if (this.refresh === 'auto')
		{
			setTimeout(() =>
			{
				this.platform.updateRobotTimer(this.robot._serial);
			}, 60 * 1000);
		}

		let eco = this.robotObject.mainAccessory.ecoService.getCharacteristic(Characteristic.On).value;
		let extraCare = this.robotObject.mainAccessory.extraCareService.getCharacteristic(Characteristic.On).value;
		let nogoLines = this.robotObject.mainAccessory.noGoLinesService.getCharacteristic(Characteristic.On).value;
		let room = (this.boundary == null) ? '' : this.boundary.name;
		this.log.debug(this.name + ": ## Start cleaning (" + (room !== '' ? room + " " : '') + "eco: " + eco + ", extraCare: " + extraCare + ", nogoLines: " + nogoLines + ", spot: " + JSON.stringify(spot) + ")");

		// Normal cleaning
		if (this.boundary == null && (typeof spot === 'undefined'))
		{
			this.robot.startCleaning(eco, extraCare ? 2 : 1, nogoLines, (error, result) =>
			{
				if (error)
				{
					this.log.error("Cannot start cleaning. " + error + ": " + JSON.stringify(result));
					callback(true);
				}
				else
				{
					callback();
				}
			});
		}
		// Room cleaning
		else if (room !== '')
		{
			this.robot.startCleaningBoundary(eco, extraCare, this.boundary.id, (error, result) =>
			{
				if (error)
				{
					this.log.error("Cannot start room cleaning. " + error + ": " + JSON.stringify(result));
					callback(true);
				}
				else
				{
					callback();
				}
			});
		}
		// Spot cleaning
		else
		{
			this.robot.startSpotCleaning(eco, spot.width, spot.height, spot.repeat, extraCare ? 2 : 1, (error, result) =>
			{
				if (error)
				{
					this.log.error("Cannot start spot cleaning. " + error + ": " + JSON.stringify(result));
					callback(true);
				}
				else
				{
					callback();
				}
			});
		}
	}

	getGoToDock(callback)
	{
		callback(null, false);
	}

	async setGoToDock(on, callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			if (on)
			{
				if (this.robot.canPause)
				{
					this.log.debug(this.name + ": ## Pause cleaning to go to dock");
					this.robot.pauseCleaning((error, result) =>
					{
						setTimeout(() =>
						{
							this.log.debug(this.name + ": ## Go to dock");
							this.robot.sendToBase(callback);
						}, 1000);
					});
				}
				else if (this.robot.canGoToBase)
				{
					this.log.debug(this.name + ": ## Go to dock");
					this.robot.sendToBase(callback);
				}
				else
				{
					this.log.warn(this.name + ": Can't go to dock at the moment");
					callback();
				}
			}
			else
			{
				callback();
			}

	}

	async getEco(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Eco Mode is " + (this.robot.eco ? 'ON' : 'OFF'));
			callback(false, this.robot.eco);
	}

	setEco(on, callback)
	{
		this.robot.eco = on;
		this.log.debug(this.name + ": " + (on ? "Enabled " : "Disabled") + " Eco Mode ");
		callback();
	}

	async getNoGoLines(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": NoGoLine is " + (this.robot.eco ? 'ON' : 'OFF'));
			callback(false, this.robot.noGoLines ? 1 : 0);
	}

	setNoGoLines(on, callback)
	{
		this.robot.noGoLines = on;
		this.log.debug(this.name + ": " + (on ? "Enabled " : "Disabled") + " NoGoLine ");
		callback();
	}

	async getExtraCare(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Care Nav is " + (this.robot.navigationMode === 2 ? 'ON' : 'OFF'));
			callback(false, this.robot.navigationMode === 2 ? 1 : 0);
	}

	setExtraCare(on, callback)
	{
		this.robot.navigationMode = on ? 2 : 1;
		this.log.debug(this.name + ": " + (on ? "Enabled " : "Disabled") + " Care Nav ");
		callback();
	}

	async getSchedule(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Schedule is " + (this.robot.isScheduleEnabled ? 'ON' : 'OFF'));
			callback(false, this.robot.isScheduleEnabled);

	}

	async setSchedule(on, callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			if (on)
			{
				this.log.debug(this.name + ": " + "Enabled" + " Schedule");
				this.robot.enableSchedule(callback);
			}
			else
			{
				this.log.debug(this.name + ": " + "Disabled" + " Schedule");
				this.robot.disableSchedule(callback);
			}
	}

	getFindMe(callback)
	{
		callback(null, false);
	}

	setFindMe(on, callback)
	{
		if (on)
		{
			this.log.debug(this.name + ": ## Find me");
			setTimeout(() =>
			{
				this.findMeService.setCharacteristic(Characteristic.On, false);
			}, 1000);

			this.robot.findMe(callback);
		}
	}

	getSpotClean(callback)
	{
		callback(null, false);
	}

	async setSpotClean(on, callback)
	{
		let spot = {
			width: this.spotPlusFeatures ? this.spotCleanService.getCharacteristic(SpotWidthCharacteristic).value : null,
			height: this.spotPlusFeatures ? this.spotCleanService.getCharacteristic(SpotHeightCharacteristic).value : null,
			repeat: this.spotCleanService.getCharacteristic(SpotRepeatCharacteristic).value
		};

		await this.platform.updateRobot(this.robot._serial)
			// Start
			if (on)
			{
				// Resume cleaning
				if (this.robot.canResume)
				{
					this.log.debug(this.name + ": ## Resume (spot) cleaning");
					this.robot.resumeCleaning(callback);
				}
				// Start cleaning
				else if (this.robot.canStart)
				{
					this.clean(callback, spot);
				}
				// Cannot start
				else
				{
					this.log.debug(this.name + ": Cannot start spot cleaning, maybe already cleaning");
					callback();
				}
			}
			// Stop
			else
			{
				if (this.robot.canPause)
				{
					this.log.debug(this.name + ": ## Pause cleaning");
					this.robot.pauseCleaning(callback);
				}
				else
				{
					this.log.debug(this.name + ": Already paused");
					callback();
				}
			}

	}

	async getSpotWidth(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Spot width  is " + this.robot.spotWidth + "cm");
			callback(false, this.robot.spotWidth);
	}

	setSpotWidth(width, callback)
	{
		this.robot.spotWidth = width;
		this.log.debug(this.name + ": Set spot width to " + width + "cm");
		callback();
	}

	async getSpotHeight(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Spot height is " + this.robot.spotHeight + "cm");
			callback(false, this.robot.spotHeight);
	}

	setSpotHeight(height, callback)
	{
		this.robot.spotHeight = height;
		this.log.debug(this.name + ": Set spot height to " + height + "cm");
		callback();
	}

	async getSpotRepeat(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Spot repeat is " + (this.robot.spotRepeat ? 'ON' : 'OFF'));
			callback(false, this.robot.spotRepeat);
	}

	setSpotRepeat(on, callback)
	{
		this.robot.spotRepeat = on;
		this.log.debug(this.name + ": " + (on ? "Enabled " : "Disabled") + " Spot repeat");
		callback();
	}

	async getDock(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": The Dock is " + (this.robot.isDocked ? "OCCUPIED" : "NOT OCCUPIED"));
			callback(false, this.robot.isDocked ? 1 : 0);
	}

	async getBatteryLevel(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Battery  is " + this.robot.charge + "%");
			callback(false, this.robot.charge);
	}

	async getBatteryChargingState(callback)
	{
		await this.platform.updateRobot(this.robot._serial)
			this.log.debug(this.name + ": Battery  is " + (this.robot.isCharging ? "CHARGING" : "NOT CHARGING"));
			callback(false, this.robot.isCharging);
	}

	updated()
	{
		if (this.boundary == null)
		{
			this.cleanService.updateCharacteristic(Characteristic.On, this.robot.canPause);

			// dock switch is on (dock not seen before) and dock has just been seen -> turn switch off
			if (this.goToDockService.getCharacteristic(Characteristic.On).value == true && this.robot.dockHasBeenSeen)
			{
				this.goToDockService.updateCharacteristic(Characteristic.On, false);
			}

			this.scheduleService.updateCharacteristic(Characteristic.On, this.robot.isScheduleEnabled);
			this.dockStateService.updateCharacteristic(Characteristic.OccupancyDetected, this.robot.isDocked ? 1 : 0);
			this.ecoService.updateCharacteristic(Characteristic.On, this.robot.eco);
			this.noGoLinesService.updateCharacteristic(Characteristic.On, this.robot.noGoLines);
			this.extraCareService.updateCharacteristic(Characteristic.On, this.robot.extraCare);

			this.spotCleanService.updateCharacteristic(SpotRepeatCharacteristic, this.robot.spotRepeat);

			if (this.spotPlusFeatures)
			{
				this.spotCleanService.updateCharacteristic(SpotWidthCharacteristic, this.robot.spotWidth);
				this.spotCleanService.updateCharacteristic(SpotHeightCharacteristic, this.robot.spotHeight);
			}
		}

		this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.robot.charge);
		this.batteryService.updateCharacteristic(Characteristic.ChargingState, this.robot.isCharging);

		// Robot has a next room to clean in queue
		if (this.nextRoom != null && this.robot.isDocked)
		{
			this.clean((error, result) =>
			{
				this.nextRoom = null;
				this.log.debug("## Starting cleaning of next room");
			});
		}
	}
}