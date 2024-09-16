import { Controller, Post, Req, Res, Get, All } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { google } from "googleapis";

@Controller('auth')
export class AuthController {

    constructor(private readonly authService: AuthService) {}

    private auth = new google.auth.GoogleAuth({
        keyFilename: 'smart-home-key.json',
        scopes: ['https://www.googleapis.com/auth/homegraph'],
    });

    private homegraph = google.homegraph({
        version: 'v1',
        auth: this.auth,
    });

    @Get('/login')
    async getLogin(@Req() req: Request, @Res() res: Response){
        console.log('Intercepting response ...', req.method, req.url);
        const responseurl = req.query.responseurl as string;
        const loginPage = this.authService.login(responseurl);
        res.send(`
        <html>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <body>
            <form action="/login" method="post">
                <input type="text" name="responseurl" value="${responseurl}" />
                <button type="submit" style="font-size:14pt">
                Link this service to Google
                </button>
            </form>
            </body>
        </html>
        `);
    }

    @Post('/login')
    async postLogin(@Req() req: Request, @Res() res: Response){
        console.log('Requesting login page', req.body);
        const responseurl = decodeURIComponent(req.body.responseurl);
        console.log(`Redirect to ${responseurl}`);
        return res.redirect(responseurl);
    }

    @All('/fakeauth')
    async handleFakeAuth(@Req() req: Request, @Res() res: Response): Promise<any>{
        console.log('Intercepting requests ...',req.query);
        console.log('Intercepting body ...',req.body);
        console.log('Intercepting header ...',req.headers);

        const responseurl = this.authService.handleFakeAuth(req.query.redirect_uri as string, req.query.state as string);
        console.log(`Set redirect as ${responseurl}`);
        return res.redirect(`/login?responseurl=${encodeURIComponent(await responseurl)}`)
    }

    @All('/faketoken')
    async handleFakeToken(@Req() req: Request, @Res() res: Response){
        const HTTP_STATUS_OK = 200;
        console.log('Intercepting requests ...',req.query);
        console.log('Intercepting body ...',req.body);
        console.log('Intercepting header ...',req.headers);

        const grantType = req.query.grant_type ? req.query.grant_type : req.body.grant_type;
        const tokenResponse = this.authService.handleFakeToken(grantType);
        return res.status(HTTP_STATUS_OK).json(tokenResponse);

    }

    @All('/requestsync*')
    async handleRequestSync(@Req() req: Request, @Res() res: Response) {
        const USER_ID = '123'
        res.set('Access-Control-Allow-Origin', '*');
        console.info(`Request SYNC for user ${USER_ID}`);
        try {
            const response = await this.homegraph.devices.requestSync({
                requestBody: {
                    agentUserId: USER_ID,
                },
            });
            console.info('Request sync response:', response.status, response.data);
            res.json(response.data);
        } catch (error) {
            console.error('Error requesting sync:', error.response?.data || error.message);
            // Check if the error is due to "Requested entity was not found"
            if (error.response?.status === 404) {
                res.status(404).send(`User or device not found: ${error.response?.data?.error?.message || error.message}`);
            } else {
                res.status(500).send(`Error requesting sync: ${error.message}`);
            }
        }
    }

    @All('/*')
    async handleAllRequest(@Req() req: Request, @Res() res: Response, next: () => void){
        console.log('Intercepting requests on Server 2:', req.method);
        next();
    }
}