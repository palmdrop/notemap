type Command = (argv: string[]) => Promise<void>;

type Commands = {
  [group: string]: {
    [action: string]: Command;
  }
}

const COMMANDS: Commands = {
  password: {
    set: () => Promise.resolve(),
  },
  token: {
    mint: () => Promise.resolve(),
    list: () => Promise.resolve(),
    revoke: () => Promise.resolve(),
  }
};

export const runCliCommand = async (args: string[]): Promise<void> => {
  const [groupName, actionName, ...options] = args;

  if(!groupName || !actionName) {
    console.error("You must specify a command group and an action");
    // TODO: usage reporting
    process.exit(1);
  }

  const group = COMMANDS[groupName];

  if(!group) {
    console.error(`Unknown command group: ${groupName}`);
    // TODO: usage reporting
    process.exit(1);
  }

  const action = group[actionName];

  if(!action) {
    console.error(`Unknown command: ${actionName}`);
    // TODO: usage reporting
    process.exit(1);
  }

  await action(options);
}

