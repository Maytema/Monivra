import { appData, firstLaunch, setAppData, setFirstLaunch } from "../js/core/state.js";
import { createSampleData } from "./fixtures/sample-data.js";

const registered = [];

export function check(name, assertion) {
  registered.push({ name, assertion });
}

// Every check starts from its own copy of the sample data; the user's data is put back afterwards.
export function runChecks() {
  const userData = appData;
  const userFirstLaunch = firstLaunch;
  try {
    return registered.map(({ name, assertion }) => {
      setAppData(createSampleData());
      setFirstLaunch(false);
      try {
        if (assertion() === false) throw Error("The check returned false");
        return { name, pass: true };
      } catch (error) {
        return { name, pass: false, error: error.message };
      }
    });
  } finally {
    setAppData(userData);
    setFirstLaunch(userFirstLaunch);
  }
}
