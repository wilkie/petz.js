// Decompiles functions of the current program and prints them as C.
//
// Arguments: addresses as segment:offset -- the segment numbered from 1, in
// decimal, as Windows and the knowledge base number them, the offset in
// hexadecimal -- or functions by name. Ghidra's NE loader puts segment N at
// selector 0x1000 + 8 (N - 1). Run by scripts/re/decompile.mjs.
// @category dogz-reverse

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;

public class Decompile extends GhidraScript {
  private Address address(String text) {
    String[] parts = text.split(":");
    if (parts.length == 2 && parts[0].matches("\\d+")) {
      int selector = 0x1000 + 8 * (Integer.parseInt(parts[0]) - 1);
      return toAddr(String.format("%04x:%s", selector, parts[1]));
    }
    for (Function function : currentProgram.getFunctionManager().getFunctions(true)) {
      if (function.getName().equals(text) || function.getName(true).equals(text)
          || function.getName().contains(text.replace("::", "@0"))) {
        return function.getEntryPoint();
      }
    }
    return null;
  }

  @Override
  public void run() throws Exception {
    DecompInterface decompiler = new DecompInterface();
    decompiler.openProgram(currentProgram);

    for (String argument : getScriptArgs()) {
      Address at = address(argument);
      Function function = at == null ? null : getFunctionContaining(at);

      if (function == null && at != null) {
        disassemble(at);
        function = createFunction(at, null);
      }

      if (function == null) {
        println("@@@ no function at " + argument);
        continue;
      }

      DecompileResults results = decompiler.decompileFunction(function, 120, monitor);
      println("@@@ " + argument + " = " + function.getEntryPoint() + " " + function.getName());
      println(results.decompileCompleted()
          ? results.getDecompiledFunction().getC()
          : "@@@ failed: " + results.getErrorMessage());
    }
  }
}
