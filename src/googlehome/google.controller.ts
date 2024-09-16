import { Controller, Post, Req, Res } from "@nestjs/common";
import { GoogleService } from "./google.service";
import { Request, Response } from "express";
import { smarthome, SmartHomeV1ExecuteRequest, SmartHomeV1ExecuteResponse, SmartHomeV1SyncRequest, SmartHomeV1SyncResponse } from "actions-on-google";
import { google } from "googleapis";

@Controller('/smarthome')
export class GoogleController {
    constructor(private readonly googleService: GoogleService) { }

    @Post('/fulfillment')
    async handleFulfillment(@Req() req: Request, @Res() res: Response) {

        const USER_ID = '123';

        const app = smarthome({
            debug: true,
        })

        const auth = new google.auth.GoogleAuth({
            keyFilename: 'smart-home-key.json',
            scopes: ['https://www.googleapis.com/auth/homegraph'],
        })

        const homegraph = google.homegraph({
            version: 'v1',
            auth: auth,
        })

        app.onSync((body: SmartHomeV1SyncRequest): SmartHomeV1SyncResponse => {
            return {
                requestId: body.requestId,
                payload: {
                    agentUserId: USER_ID,
                    devices: [{
                        id: 'washer',
                        type: 'action.devices.types.WASHER',
                        traits: [
                            'action.devices.traits.OnOff',
                            'action.devices.traits.StartStop',
                            'action.devices.traits.RunCycle',
                        ],
                        name: {
                            defaultNames: ['My Washer'],
                            name: 'Washer',
                            nicknames: ['Washer'],
                        },
                        willReportState: false
                    }, {
                        id: 'light',
                        type: 'action.devices.types.LIGHT',
                        traits: [
                            'action.devices.traits.Brightness',
                            'action.devices.traits.OnOff',
                            'action.devices.traits.ColorSetting'
                        ],
                        name: {
                            defaultNames: [`Smart Lamp`],
                            name: 'Smart Lamp',
                            nicknames: ['abc']
                        },
                        willReportState: false
                    }, {
                        id: 'closet',
                        type: 'action.devices.types.CLOSET',
                        traits: [
                            'action.devices.traits.OpenClose',
                        ],
                        name: {
                            defaultNames: [`Smart Closet`],
                            name: 'Smart Closet',
                            nicknames: ['closet']
                        },
                        willReportState: false
                    }, {
                        id: 'fan',
                        type: 'action.devices.types.FAN',
                        traits: [
                            'action.devices.traits.OnOff',
                        ],
                        name: {
                            defaultNames: [`Smart Fan`],
                            name: 'Smart Fan',
                            nicknames: ['fan']
                        },
                        willReportState: false
                    }],
                },
            }
        })

        var storeState = { on: true, isPaused: false, isRunning: false };

        const queryFirebase = async (deviceId) => {
            console.log("deviceId--", deviceId);
            return {
                on: storeState.on,
                isPaused: storeState.isPaused,
                isRunning: storeState.isRunning,
            };
        };
        const queryDevice = async (deviceId) => {
            const data = await queryFirebase(deviceId);
            return {
                on: data.on,
                isPaused: data.isPaused,
                isRunning: data.isRunning,
                currentRunCycle: [
                    {
                        currentCycle: "rinse",
                        nextCycle: "spin",
                        lang: "en",
                    },
                ],
                currentTotalRemainingTime: 1212,
                currentCycleRemainingTime: 301,
            };
        };

        app.onQuery(async (body) => {
            const { requestId } = body;
            const payload = {
                devices: {},
            };
            const queryPromises = [];
            const intent = body.inputs[0];
            for (const device of intent.payload.devices) {
                const deviceId = device.id;
                queryPromises.push(
                    queryDevice(deviceId).then((data) => {
                        payload.devices[deviceId] = data;
                    })
                );
            }
            await Promise.all(queryPromises);
            return {
                requestId: requestId,
                payload: payload,
            };
        });

        const updateDevice = async (execution, deviceId) => {
            const { params, command } = execution;
            let state;
            let ref;
            switch (command) {
                case "action.devices.commands.OnOff":
                    state = { on: params.on };
                    storeState.on = state.on;
                    break;
                case "action.devices.commands.StartStop":
                    state = { isRunning: params.start };
                    storeState.isRunning = state.isRunning;
                    break;
                case "action.devices.commands.PauseUnpause":
                    state = { isPaused: params.pause };
                    storeState.isPaused = state.isPaused;
                    break;
            }

            return state;
        };

        app.onExecute(async (body): Promise<SmartHomeV1ExecuteResponse> => {
            const { requestId } = body;
            const result : any = {
                ids: [],
                status: 'success',
                states: {
                    online: true,
                },
            };

            const executePromises = [];
            const intent = body.inputs[0];
            for (const command of intent.payload.commands) {
                for (const device of command.devices) {
                    for (const execution of command.execution) {
                        executePromises.push(
                            updateDevice(execution, device.id)
                                .then((data) => {
                                    result.ids.push(device.id);
                                    Object.assign(result.states, data);
                                })
                                .catch(() => console.error("EXECUTE", device.id))
                        );
                    }
                }
            }

            await Promise.all(executePromises);
            return {
                requestId: requestId,
                payload: {
                    commands: [result],
                },
            };
        });

        app.onDisconnect(() => {
            console.log("User account unlinked from Google Assistant");
            return {};
        });

        return app;

    }


    @Post('/*')
    async handleAll() {
        console.log('Smarthome intent');
    }
}