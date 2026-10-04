// Prints the current program's memory blocks: name, start and length. Run by
// hand to see where Ghidra's NE loader put a module's segments.
// @category dogz-reverse

import ghidra.app.script.GhidraScript;
import ghidra.program.model.mem.MemoryBlock;

public class Blocks extends GhidraScript {
  @Override
  public void run() throws Exception {
    for (MemoryBlock block : currentProgram.getMemory().getBlocks()) {
      println("@@@ " + block.getName() + " " + block.getStart() + " " + block.getSize());
    }
  }
}
