import { setPassword } from "./password";
import { listTokens, mintToken, revokeToken } from "./tokens";
import { USAGE } from "./usage";

type Command = (argv: string[]) => Promise<void>;

type Commands = {
  [group: string]: {
    [action: string]: Command;
  };
};

const COMMANDS: Commands = {
  password: {
    set: setPassword,
  },
  token: {
    mint: mintToken,
    list: listTokens,
    revoke: revokeToken,
  },
};

/** Says what was not understood, then what would have been. */
const refuse = (said: string): void => {
  console.error(`notemap: ${said}`);
  console.error("");
  console.error(USAGE);

  process.exitCode = 2;
};

export const runCliCommand = async (args: string[]): Promise<void> => {
  const [groupName, actionName, ...options] = args;

  if (groupName === "help") {
    console.log(USAGE);
    return;
  }

  const group = groupName === undefined ? undefined : COMMANDS[groupName];

  if (group === undefined) {
    refuse(`there is no "${groupName ?? ""}" to run`);
    return;
  }

  const action = actionName === undefined ? undefined : group[actionName];

  if (action === undefined) {
    refuse(
      actionName === undefined
        ? `${groupName} needs one of: ${Object.keys(group).join(", ")}`
        : `${groupName} has no "${actionName}" — try one of: ${Object.keys(group).join(", ")}`,
    );
    return;
  }

  await action(options);
};
