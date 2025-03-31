import { AnchorProvider, BN } from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import { ed25519 } from "@noble/curves/ed25519";
import { Program } from "@coral-xyz/anchor";
import { StreamFlowDemo } from "../target/types/stream_flow_demo";
import {
  ComputeBudgetProgram,
  Keypair,
  MessageV0,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

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

    let userKeypair = Keypair.generate();
    let toUserSolIx = SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: userKeypair.publicKey,
      lamports: 1e14,
    });

    let userWsolAccountPubkey = await getAssociatedTokenAddress(
      NATIVE_MINT,
      userKeypair.publicKey
    );
    let userWsolAccountIx = createAssociatedTokenAccountIdempotentInstruction(
      userKeypair.publicKey,
      userWsolAccountPubkey,
      userKeypair.publicKey,
      NATIVE_MINT
    );

    let transferIx = SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: userWsolAccountPubkey,
      lamports: 1e13,
    });
    let syncNativeIx = createSyncNativeInstruction(userWsolAccountPubkey);

    console.log("create deposit ....");
    const txDeposit = await program.methods
      .deposit(new BN(1e11))
      .accounts({
        mint: NATIVE_MINT,
        sender: userKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([
        toUserSolIx,
        userWsolAccountIx,
        transferIx,
        syncNativeIx,
      ])
      .signers([userKeypair])
      .rpc();
    console.log("deposit tx: ", txDeposit);
    await new Promise((r) => setTimeout(() => r(0), 2000));

    console.log("create sf ....");
    const d = await getAssociatedTokenAddress(
      NATIVE_MINT,
      provider.wallet.publicKey
    );
    console.log("user wsol ata is: ", d.toBase58());
    const metadataKeypair = Keypair.generate();
    const streamName = Buffer.from("test stream", "utf-8");
    try {
      // const withdrawIx = await program.methods
      //   .withdraw()
      //   .accounts({
      //     mint: NATIVE_MINT,
      //     sender: provider.wallet.publicKey,
      //     depositor: userKeypair.publicKey,
      //     tokenProgram: TOKEN_PROGRAM_ID,
      //   })
      //   .instruction();
      const createSfIx = await program.methods
        .createSf({
          startTime: new BN(0),
          cancelableBySender: false,
          cancelableByRecipient: false,
          automaticWithdrawal: true,
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
          depositor: userKeypair.publicKey,
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
        .instruction();

      const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 800000,
      });
      let recentBlockhash = await provider.connection.getLatestBlockhash();
      const v0Msg = MessageV0.compile({
        instructions: [cuLimitIx, createSfIx],
        payerKey: provider.wallet.publicKey,
        recentBlockhash: recentBlockhash.blockhash,
        addressLookupTableAccounts: null,
      });

      const needToSign = v0Msg.serialize();
      const sign1 = ed25519.sign(
        needToSign,
        provider.wallet.payer.secretKey.slice(0, 32)
      );
      console.log("first signature is: ", bs58.encode(sign1));
      const sign2 = ed25519.sign(
        needToSign,
        metadataKeypair.secretKey.slice(0, 32)
      );
      console.log("second signature is: ", bs58.encode(sign2));
      const txV0 = new VersionedTransaction(v0Msg, [sign1, sign2]);
      console.log("tx hash is: ", bs58.encode(txV0.signatures[0]));

      const tx = await provider.connection.sendTransaction(txV0);
      await provider.connection.confirmTransaction({
        signature: tx,
        lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
        blockhash: recentBlockhash.blockhash,
      });
      console.log("create sf tx: ", tx);
      await new Promise((r) => setTimeout(() => r(0), 2000));
      const txResp = await provider.connection.getTransaction(tx, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      console.log(txResp.meta.logMessages.slice(35));
    } catch (e) {
      if (e instanceof SendTransactionError) {
        let logs = await e.getLogs(provider.connection);
        console.log(logs);
      } else {
        console.error(e);
      }
    }

    const b = await provider.connection.getBalance(provider.wallet.publicKey);
    console.log("balance is: ", BigInt(b) / BigInt(1e9));
  });
});
