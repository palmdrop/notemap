export const USAGE = `notemap — capture notes, and route them somewhere else.

  notemap [--config <path>]
      Run the daemon. This is what the container's entrypoint does.

  notemap password set [--name <name>]
      Set the credential every request is then held against, ending every
      session that was open. Read from the terminal, or from stdin when piped.

  notemap token mint --name <name> [--expires <instant>]
      Mint an access token for something that is not a browser, and print it.
      It is stored hashed, so this is the only time it can be read.

  notemap token list
      What exists, and when each was last used.

  notemap token revoke <id>
      Take one away. It stops working on the next request.

Every command reads --config <path>, then NOTEMAP_CONFIG, then the default
config location. There is no command for users, because there are none: one
credential, and the tokens it issues.`;
