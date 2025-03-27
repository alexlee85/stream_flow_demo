import { AnchorProvider, BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StreamFlowDemo } from "../target/types/stream_flow_demo";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("stream_flow_demo", () => {
  console.log(process.env.ANCHOR_PROVIDER_URL);
  // Configure the client to use the local cluster.
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);
  console.log("wallet: ", provider.wallet.publicKey.toBase58());

  const program = anchor.workspace.streamFlowDemo as Program<StreamFlowDemo>;

  it("Is initialized!", async () => {
    const a = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log("balance is: ", BigInt(a) / BigInt(1e9));
    // Add your test here.
    const wsolMint = new PublicKey(
      "So11111111111111111111111111111111111111112"
    );
    const metadataKeypair = Keypair.generate();
    let userWsolAccountPubkey = await getAssociatedTokenAddress(
      wsolMint,
      provider.wallet.publicKey
    );
    let userWsolAccountIx = createAssociatedTokenAccountIdempotentInstruction(
      provider.wallet.publicKey,
      userWsolAccountPubkey,
      provider.wallet.publicKey,
      wsolMint
    );

    let transferIx = SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: userWsolAccountPubkey,
      lamports: 1e12,
    });
    let syncNativeIx = createSyncNativeInstruction(userWsolAccountPubkey);

    const streamName = Buffer.from("test stream", "utf-8");
    const tx = await program.methods
      .deposit({
        startTime: new BN(0),
        netAmountDeposited: new BN(1e11),
        period: new BN(1),
        amountPerPeriod: new BN(1e11),
        cliff: new BN(0),
        cliffAmount: new BN(1e11),
        cancelableBySender: false,
        cancelableByRecipient: false,
        automaticWithdrawal: false,
        transferableByRecipient: false,
        transferableBySender: false,
        canTopup: false,
        streamName: [...streamName],
        withdrawFrequency: new BN(1),
        pausable: false,
        canUpdateRate: false,
      })
      .accounts({
        sender: provider.wallet.publicKey,
        metadata: metadataKeypair.publicKey,
        mint: NATIVE_MINT,
        streamflowTreasury: new PublicKey(
          "5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw"
        ),
        feeOracle: new PublicKey(
          "B743wFVk2pCYhV91cn287e1xY7f1vt4gdY48hhNiuQmT"
        ),
        withdrawor: new PublicKey(
          "wdrwhnCv4pzW8beKsbPa4S2UDZrXenjg16KJdKSpb5u"
        ),
        streamflowProgram: new PublicKey(
          "strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m"
        ),
        partner: new PublicKey("wdrwhnCv4pzW8beKsbPa4S2UDZrXenjg16KJdKSpb5u"),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([userWsolAccountIx, transferIx, syncNativeIx])
      .signers([provider.wallet.payer, metadataKeypair])
      .rpc();
    console.log("Your transaction signature", tx);

    const b = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log("balance is: ", BigInt(b) / BigInt(1e9));
  });
});
