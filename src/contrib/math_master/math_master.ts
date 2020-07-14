/**
 * Math Master
 *  Huan <zixia@zixia.net>
 */
import {
  timer,
  Subject,
}                   from 'rxjs'
import {
  tap,
  scan,
  map,
  switchMap,
  takeUntil,
  startWith,
}                   from 'rxjs/operators'
import {
  log,
  FileBox,
}                   from 'wechaty'
import {
  Vorpal,
  CommandContext,
  Args,
}                   from 'wechaty-vorpal'

import {
  WechatyVorpalConfig,
}                       from '../../config'

import {
  TIMER_MAX,
}                     from './config'
import {
  State,
  nextState,
  initialGameState,
}                       from './reducer'
import {
  registerLeaderBoard,
  reportLeaderBoard,
}                       from './leader_board'

export interface MathMasterConfig extends WechatyVorpalConfig {}

function MathMaster (config: MathMasterConfig = {}) {
  log.verbose('WechatyVorpalContrib', 'MathMaster(%s)', JSON.stringify(config))

  const commandName = config.command ?? 'math_master'

  return function MathMasterExtension (vorpal: Vorpal) {
    log.verbose('WechatyVorpalContrib', 'MathMasterExtension(vorpal)')

    vorpal
      .command(`${commandName}`, 'play the match master game')
      .option('-l --leaderboard', 'show leader board')
      .action(mathMasterAction as any)
  }
}

// interface MathMasterOptions {}

async function mathMasterAction (
  this: CommandContext,
  args: Args
): Promise<number> {
  log.verbose('WechatyVorpalContrib', 'mathMasterAction("%s")', JSON.stringify(args))

  if (args.options.leaderboard) {
    const board = reportLeaderBoard()
    this.stdout.next(board)
    return 0
  }

  const player = this.message.talker()

  const banner = FileBox.fromUrl('https://assets.tvokids.com/prod/s3fs-public/app-images/tileSM_app_mathMaster.jpg')
  await this.message.say(banner)

  this.stdout.next(`Hello, ${player.name()}!`)
  await this.wechaty.sleep(1000)
  this.stdout.next('Welcome to the Wechaty Math Master GAME!')
  await this.wechaty.sleep(1000)
  this.stdout.next('Please try your best to answer math questions to become a real Math Master!')

  await this.wechaty.sleep(1000)
  this.stdout.next('START!')

  await new Promise(setImmediate)

  /**
  * RxJS Game - Inspired by Catch The Dot Game (By adamlubek)
  *  This recipe shows usage of scan operator for state management in simple game
  *  https://www.learnrxjs.io/learn-rxjs/recipes/catch-the-dot-game
  */

  const countDownTimer = (v: number) => {
    if (v >= 0 && v <= 3) {
      this.stdout.next(`${v} ...`)
    }
  }

  /**
   * How do I make an Observable Interval start immediately without a delay?
   *  https://stackoverflow.com/a/44166071/1123955
   *
   * Huan(202007): We need to emit the state immediately
   *  or we might get a undefined for our final state.
   */
  const makeInterval = (state: State) => timer(0, 1000).pipe(
    map(v => TIMER_MAX - v),
    tap(countDownTimer),
    map(v => ({
      ...state,
      timer: v,
    })),
  )

  /**
   * Check Game Over
   */

  const ask = ({ score, question }: State) => {
    this.stdout.next([
      `Score: ${score}`,
      '',
      `${question} = ?`,
    ].join('\n'))
  }

  const gameOver$ = new Subject()
  const checkGameOver = (state: State) => {
    // console.info('checkGameOver:', state)
    if (state.timer < 0) {
      gameOver$.next()
      gameOver$.complete()
    }
  }

  /**
   * Main Game Process
   */
  const game$ = this.stdin.pipe(
    startWith(undefined),
    scan(nextState(this.stdout), initialGameState),
    tap(checkGameOver), // Wrong Answer will set timer to -1
    tap(ask),
    switchMap(makeInterval),
    tap(checkGameOver), // Time Out
    takeUntil(gameOver$),
  )

  try {
    const state = await game$.toPromise()

    const gameOver = `Game Over

    ${player.name()}, Your final score is: ${state.score}!
    `

    this.stdout.next(gameOver)

    await registerLeaderBoard(this, player, state.score)
    const board = reportLeaderBoard()

    this.stdout.next(board)

    await new Promise(setImmediate)
    return 0

  } catch (e) {
    log.error('WechatyVorpalContrib', 'MathMaster() game$.toPromise() rejection %s', e)
    return 1
  }

}

export { MathMaster }
