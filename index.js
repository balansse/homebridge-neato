"use strict";
let botvac = require('node-botvac'),
	Service,
	Characteristic,
	NeatoVacuumRobotAccessory;

module.exports = function (homebridge)
{
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	NeatoVacuumRobotAccessory = require('./accessories/neatoVacuumRobot')(Service, Characteristic);
	homebridge.registerPlatform("homebridge-neato", "NeatoVacuumRobot", NeatoVacuumRobotPlatform);
};

class NeatoVacuumRobotPlatform {
	constructor(log, config, api) {
		this.log = log;
		this.config = config;
		this.api = api;

		this.serial = "1-3-3-7";
		this.email = config['email'];
		this.password = config['password'];
		this.hiddenServices = '';
		this.hiddenServices = ('disabled' in config ? config['disabled'] : this.hiddenServices);
		this.hiddenServices = ('hidden' in config ? config['hidden'] : this.hiddenServices);

		// Array of real robots and associated robot accessories (incl rooms)
		this.robots = [];
		this.accessories = [];
		this.nextRoom = null;

		if ('refresh' in config && config['refresh'] !== 'auto')
		{
			// parse config parameter
			this.refresh = parseInt(config['refresh']);
			// must be integer and positive
			this.refresh = (typeof this.refresh !== 'number' || (this.refresh % 1) !== 0 || this.refresh < 0) ? 60 : this.refresh;
			// minimum 60s to save some load on the neato servers
			if (this.refresh > 0 && this.refresh < 60)
			{
				this.log.warn("Minimum refresh time is 60 seconds to not overload the neato servers");
				this.refresh = (this.refresh > 0 && this.refresh < 60) ? 60 : this.refresh;
			}
		}
		// default auto
		else
		{
			this.refresh = 'auto';
		}
		this.log("Refresh is set to: " + this.refresh + (this.refresh !== 'auto' ? ' seconds' : ''));
	}

	async getRobots()
	{
		this.log.debug("Loading your robots");
		let client = new botvac.Client();

		// Login
		try {
			await client.authorize(this.email, this.password, false);
		}
		catch (error) {
			this.log.error("Can't log on to Neato cloud. Please check your internet connection and your credentials. Try again later if the neato servers have issues: " + error);
			return;
		}

		// Get all robots
		let robots;
		try {
			robots = await client.getRobots();
		}
		catch (error)
		{
			this.log.error("Successful login but can't connect to your Neato robots: " + error);
			return;
		}

		if (robots.length === 0)
		{
			this.log.error("Successful login but no robots associated with your account.");
			this.robots = [];
			return;
		}
		else
		{
			this.log.debug("Found " + robots.length + " robots");

			for (const robot of robots)
			{
				// Get all maps for each robot
				let maps;
				try {
					maps = await robot.getPersistentMaps();
				}
				catch (error) {
					this.log.error("Error updating persistent maps: " + error + ": " + maps);
				}

				// Robot has maps
				if (maps.length !== 0)
				{
					for (const map of maps)
					{
						// Save zones in each map
						let boundaries;
						try {
							boundaries = await robot.getMapBoundaries(map.id);
						}
						catch (error) {
							this.log.error("Error getting boundaries: " + error)
						}
						map.boundaries = boundaries;
					}
				}

				robot.maps = maps;
				this.robots.push({device: robot, meta: robot.meta, availableServices: robot.availableServices});
			}
		}
	}

	async loadRobotsAccessories()
	{
		this.log.debug("Get robots");
		let accessories = [];
		this.boundaryNames = [];

		try {
			await this.getRobots();
		}
		catch (error) {
			this.log.error(error);
		}

		for (const robot of this.robots)
		{
			this.log("Found robot named \"" + robot.device.name + "\" with serial \"" + robot.device._serial.substring(0, 9) + "XXXXXXXXXXXX\"");

			let mainAccessory = new NeatoVacuumRobotAccessory(this, robot);
			this.accessories.push(mainAccessory);

			robot.mainAccessory = mainAccessory;
			robot.roomAccessories = [];

			// Start Update Intervall
			this.updateRobotTimer(robot.device._serial);

			if (robot.device.maps)
			{
				for (const map of robot.device.maps)
				{
					if (map.boundaries)
					{
						for (const boundary of map.boundaries)
						{
							if (boundary.type === "polygon")
							{
								robot.boundary = boundary;
								let roomAccessory = new NeatoVacuumRobotAccessory(this, robot);
								accessories.push(roomAccessory);

								robot.roomAccessories.push(roomAccessory);
							}
						}
					}
				}
			}
		}

		callback(accessories);

	}
	
	async updateRobot(serial)
	{
		let robot = this.getRobot(serial);

		// Data is up to date
		if (typeof (robot.lastUpdate) !== 'undefined' && new Date() - robot.lastUpdate < 2000)
		{
			return;
		}
		else
		{
			this.log.debug(robot.device.name + ": ++ Updating robot state");
			robot.lastUpdate = new Date();
			try {
				await robot.device.getState();
			}
			catch (error)
			{
				this.log.error("Cannot update robot. Check if robot is online. " + error);
			}
		}
	}

	getRobot(serial)
	{
		let result;
		this.robots.forEach(function (robot)
		{
			if (robot.device._serial === serial)
			{
				result = robot;
			}
		});
		return result;
	}

	async updateRobotTimer(serial)
	{
		await this.updateRobot(serial);

		let robot = this.getRobot(serial);
		// Clear any other overlapping timers for this robot
		clearTimeout(robot.timer);

		// Tell all accessories of this robot (mainAccessory and roomAccessories) that updated robot data is available
		robot.mainAccessory.updated();
		robot.roomAccessories.forEach(accessory =>
		{
			accessory.updated();
		});

		// Periodic refresh interval set in config
		if (this.refresh !== 'auto' && this.refresh !== 0)
		{
			this.log.debug(robot.device.name + ": ++ Next background update in " + this.refresh + " seconds");
			robot.timer = setTimeout(this.updateRobotTimer.bind(this), this.refresh * 1000, serial);
		}
		// Auto refresh set in config
		else if (this.refresh === 'auto' && robot.device.canPause)
		{
			this.log.debug(robot.device.name + ": ++ Next background update in 60 seconds while cleaning (auto mode)");
			robot.timer = setTimeout(this.updateRobotTimer.bind(this), 60 * 1000, serial);
		}
		// No refresh
		else
		{
			this.log.debug(robot.device.name + ": ++ Stopped background updates");
		}

	}

	configureAccessory(accessory) {
		this.accessories.push(accessory);
	}
}