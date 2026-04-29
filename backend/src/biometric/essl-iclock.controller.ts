import {
  All,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { EsslService } from './essl.service';

/**
 * eSSL / ZKTeco "iclock" ADMS push protocol adapter.
 *
 * Devices are configured with:  http://<host>/iclock   (no /api prefix)
 * They authenticate by serial number (SN) against `biometric_devices` table.
 *
 * Endpoints implemented:
 *   GET  /iclock/cdata?SN=xxx&options=all&pushver=...   handshake
 *   POST /iclock/cdata?SN=xxx&table=ATTLOG&Stamp=...    attendance push (TSV body)
 *   POST /iclock/cdata?SN=xxx&table=OPERLOG&...         user/device events (ack only)
 *   GET  /iclock/getrequest?SN=xxx                      command poll (returns OK)
 *   POST /iclock/devicecmd?SN=xxx                       command ack (returns OK)
 *   GET  /iclock/ping                                   liveness
 *
 * Note: this controller is mounted OUTSIDE the global /api prefix (see main.ts wiring).
 */
@ApiExcludeController()
@Controller({ path: 'iclock', version: VERSION_NEUTRAL })
@Public()
export class EsslIclockController {
  private readonly logger = new Logger(EsslIclockController.name);

  constructor(private readonly essl: EsslService) {}

  @Get('ping')
  @Header('Content-Type', 'text/plain')
  ping(): string {
    return 'OK';
  }

  /** Device handshake. Returns server config the device should adopt. */
  @Get('cdata')
  @Header('Content-Type', 'text/plain')
  async handshake(@Query('SN') sn: string): Promise<string> {
    return this.essl.handshake(sn);
  }

  /** Device polls for pending commands. */
  @Get('getrequest')
  @Header('Content-Type', 'text/plain')
  async getRequest(@Query('SN') sn: string): Promise<string> {
    await this.essl.touch(sn);
    return 'OK';
  }

  /** Device acknowledges a previously-issued command. */
  @Post('devicecmd')
  @Header('Content-Type', 'text/plain')
  @HttpCode(200)
  async deviceCmd(@Query('SN') sn: string): Promise<string> {
    await this.essl.touch(sn);
    return 'OK';
  }

  /** Main attendance / operation log push. Body is TSV text. */
  @Post('cdata')
  @Header('Content-Type', 'text/plain')
  @HttpCode(200)
  async pushData(
    @Query('SN') sn: string,
    @Query('table') table: string,
    @Query('Stamp') stamp: string,
    @Body() body: unknown,
    @Req() req: any,
  ): Promise<string> {
    // Body parsing: NestJS may give us a Buffer/string depending on body-parser.
    let raw = '';
    if (typeof body === 'string') raw = body;
    else if (Buffer.isBuffer(body)) raw = body.toString('utf8');
    else if (body && typeof body === 'object') raw = JSON.stringify(body);
    if (!raw && req?.rawBody) raw = req.rawBody.toString('utf8');

    const tableU = (table || '').toUpperCase();
    if (tableU === 'ATTLOG') {
      const count = await this.essl.ingestAttlog(sn, raw);
      return `OK: ${count}\nStamp=${stamp || Date.now()}`;
    }

    // OPERLOG / other tables — acknowledge only for now.
    await this.essl.touch(sn);
    return `OK\nStamp=${stamp || Date.now()}`;
  }

  /** Catch-all for any other iclock subpaths the device may probe. */
  @All('*')
  @Header('Content-Type', 'text/plain')
  fallback(): string {
    return 'OK';
  }
}
